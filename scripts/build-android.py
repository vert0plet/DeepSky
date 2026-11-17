#!/usr/bin/env python3
"""Build DeepSky with the project wrapper and verify the resulting APK."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--verify', action='store_true', help='run JS tests, Android unit tests and lint')
parser.add_argument('--connected', action='store_true', help='also run instrumentation tests on connected test devices')
parser.add_argument('--release', action='store_true', help='build the release variant and sign with an external keystore')
parser.add_argument('--node')
parser.add_argument('--output')
args = parser.parse_args()

config_file = ROOT.parent / 'android-toolchain/toolchain.json'
config = json.loads(config_file.read_text()) if config_file.exists() else {}
node = args.node or shutil.which('node') or config.get('node')
if not node:
    parser.error('Install Node.js 22+ or pass --node /absolute/path/to/node')
env = os.environ.copy()
env['JAVA_HOME'] = env.get('JAVA_HOME') or config.get('java_home', '')
env['ANDROID_HOME'] = env.get('ANDROID_HOME') or config.get('sdk', '')
if not env['JAVA_HOME'] or not env['ANDROID_HOME']:
    parser.error('Set JAVA_HOME (JDK 21) and ANDROID_HOME (Android SDK 36)')
env['PATH'] = os.pathsep.join((str(Path(node).parent), str(Path(env['JAVA_HOME']) / 'bin'), env['PATH']))
signing = {}
if args.release:
    for name in ('DEEPSKY_KEYSTORE', 'DEEPSKY_KEY_ALIAS', 'DEEPSKY_STORE_PASS', 'DEEPSKY_KEY_PASS'):
        if not env.get(name):
            parser.error('Missing signing environment variable ' + name)
        signing[name] = env.pop(name)
    signing['DEEPSKY_KEYSTORE'] = str(Path(signing['DEEPSKY_KEYSTORE']).expanduser().resolve())
    if not Path(signing['DEEPSKY_KEYSTORE']).is_file():
        parser.error('Signing keystore does not exist')

def run(command, cwd=ROOT, extra=None):
    subprocess.run([str(x) for x in command], cwd=cwd, env={**env, **(extra or {})}, check=True)

run([node, 'node_modules/esbuild/bin/esbuild', 'scripts/native-entry.mjs', '--bundle', '--format=esm',
     '--target=es2020', '--outfile=dist/vendor/native-bridge.mjs'])
if args.verify:
    for name in ('core', 'filter-model', 'overview', 'observing', 'planetarium', 'weather'):
        run([node, 'scripts/test-' + name + '.mjs'])
run([sys.executable, 'scripts/prepare-offline.py'])
run([node, 'node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android'])
variant = 'Release' if args.release else 'Debug'
tasks = [':app:assemble' + variant]
if args.verify:
    tasks.extend((':app:test' + variant + 'UnitTest', ':app:lint' + variant))
if args.connected:
    tasks.append(':app:connectedDebugAndroidTest')
run(['./gradlew', *tasks, '--console=plain'], ROOT / 'android')

directory = ROOT / 'android/app/build/outputs/apk' / variant.lower()
signer = Path(env['ANDROID_HOME']) / 'build-tools/36.0.0/apksigner'
apk = directory / ('app-' + variant.lower() + '.apk')
if args.release:
    run([signer, 'sign', '--ks', signing['DEEPSKY_KEYSTORE'], '--ks-key-alias', signing['DEEPSKY_KEY_ALIAS'],
         '--ks-pass', 'env:DEEPSKY_STORE_PASS', '--key-pass', 'env:DEEPSKY_KEY_PASS', '--out', apk,
         directory / 'app-release-unsigned.apk'], extra=signing)
run([signer, 'verify', '--verbose', apk])
if args.output:
    destination = Path(args.output).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(apk, destination)
    apk = destination
    checksum = hashlib.sha256(apk.read_bytes()).hexdigest()
    apk.with_suffix('.sha256').write_text(checksum + '  ' + apk.name + '\n')
print('APK:', apk)
