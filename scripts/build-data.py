#!/usr/bin/env python3
"""Build an attributed offline observing catalogue from OpenNGC and HYG.

Run from any directory with Python 3. Downloads are cached beside this script;
only derived, compact data is placed in dist/data. Coordinates are J2000.
"""
import csv
import json
import math
import re
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'dist' / 'data'
OUT.mkdir(parents=True, exist_ok=True)
URLS = {
    'NGC.csv': 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv',
    'addendum.csv': 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/addendum.csv',
    'HYG.csv': 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv',
}
for filename, url in URLS.items():
    if not (HERE / filename).exists():
        urllib.request.urlretrieve(url, HERE / filename)

CONST = dict(zip(
    'And Ant Aps Aql Aqr Ara Ari Aur Boo CMa CMi CVn Cae Cam Cap Car Cas Cen Cep Cet Cha Cir Cnc Col Com CrA CrB Crt Cru Crv Cyg Del Dor Dra Equ Eri For Gem Gru Her Hor Hya Hyi Ind LMi Lac Leo Lep Lib Lup Lyn Lyr Men Mic Mon Mus Nor Oct Oph Ori Pav Peg Per Phe Pic PsA Psc Pup Pyx Ret Scl Sco Sct Se1 Se2 Sex Sge Sgr Tau Tel TrA Tri Tuc UMa UMi Vel Vir Vol Vul'.split(),
    ['Андромеда','Насос','Райская Птица','Орёл','Водолей','Жертвенник','Овен','Возничий','Волопас','Большой Пёс','Малый Пёс','Гончие Псы','Резец','Жираф','Козерог','Киль','Кассиопея','Центавр','Цефей','Кит','Хамелеон','Циркуль','Рак','Голубь','Волосы Вероники','Южная Корона','Северная Корона','Чаша','Южный Крест','Ворон','Лебедь','Дельфин','Золотая Рыба','Дракон','Малый Конь','Эридан','Печь','Близнецы','Журавль','Геркулес','Часы','Гидра','Южная Гидра','Индеец','Малый Лев','Ящерица','Лев','Заяц','Весы','Волк','Рысь','Лира','Столовая Гора','Микроскоп','Единорог','Муха','Наугольник','Октант','Змееносец','Орион','Павлин','Пегас','Персей','Феникс','Живописец','Южная Рыба','Рыбы','Корма','Компас','Сетка','Скульптор','Скорпион','Щит','Змея','Змея','Секстант','Стрела','Стрелец','Телец','Телескоп','Южный Треугольник','Треугольник','Тукан','Большая Медведица','Малая Медведица','Паруса','Дева','Летучая Рыба','Лисичка']
))
TYPES = {'G':'galaxy','GPair':'galaxy','GTrpl':'galaxy','GGroup':'galaxy','OCl':'open','GCl':'globular','PN':'planetary','HII':'emission','EmN':'emission','Neb':'emission','RfN':'reflection','DrkN':'dark','SNR':'snr','Cl+N':'emission','*Ass':'open','**':'special','Other':'special'}
TYPE_TEXT = {
    'galaxy':'Галактика за пределами Млечного Пути. Для наблюдения слабых внешних областей особенно полезно тёмное прозрачное небо.',
    'open':'Рассеянное звёздное скопление в Млечном Пути. Сравнивайте расположение звёзд с поисковой картой и подбирайте поле окуляра по размеру объекта.',
    'globular':'Шаровое скопление — плотная система множества звёзд. На небольшом увеличении выглядит компактным светлым пятном; разрешение на звёзды зависит от инструмента и условий.',
    'planetary':'Планетарная туманность — газовая оболочка, сброшенная эволюционировавшей звездой. Для уверенного распознавания сопоставьте объект с окружающими звёздами.',
    'emission':'Светящаяся газовая туманность в Млечном Пути. Её видимость зависит от контраста с небом; каталожный размер может заметно превышать видимую в окуляре область.',
    'reflection':'Отражательная туманность: межзвёздная пыль рассеивает свет соседних звёзд. Для наблюдения слабого свечения нужно тёмное прозрачное небо.',
    'dark':'Тёмное пылевое облако, заметное по поглощению фонового света. Здесь ищут характерное потемнение на фоне звёзд или светлой туманности.',
    'snr':'Остаток сверхновой — расширяющееся вещество после взрыва звезды. Отдельные волокна могут иметь очень разный контраст с фоном неба.',
    'special':'Необычный объект каталога. Перед наблюдением проверьте его природу и точное положение по поисковой карте.',
}
COMMON = {
    'M1':'Крабовидная туманность','M6':'Бабочка','M7':'Скопление Птолемея','M8':'Лагуна','M11':'Дикая Утка','M13':'Большое скопление Геркулеса','M16':'Орёл','M17':'Омега','M20':'Тройная туманность','M24':'Звёздное облако Стрельца','M27':'Гантель','M31':'Галактика Андромеды','M33':'Галактика Треугольника','M42':'Туманность Ориона','M44':'Ясли','M45':'Плеяды','M51':'Водоворот','M57':'Кольцо','M63':'Подсолнух','M64':'Чёрный Глаз','M76':'Малая Гантель','M81':'Галактика Боде','M82':'Сигара','M83':'Южная Вертушка','M97':'Сова','M101':'Вертушка','M104':'Сомбреро',
    'NGC40':'Галстук-бабочка','NGC281':'Пакман','NGC457':'Стрекоза','NGC869':'Двойное скопление: h Персея','NGC884':'Двойное скопление: χ Персея','NGC1499':'Калифорния','NGC2024':'Пламя','NGC2237':'Розетка','NGC2261':'Переменная туманность Хаббла','NGC2264':'Рождественская Ёлка','NGC2392':'Туманность Клоун','NGC4565':'Игла','NGC4631':'Кит','NGC5907':'Заноза','NGC6543':'Кошачий Глаз','NGC6826':'Мерцающая туманность','NGC6888':'Полумесяц','NGC6960':'Вуаль: западная часть','NGC6992':'Вуаль: восточная часть','NGC7000':'Северная Америка','NGC7023':'Ирис','NGC7662':'Голубой Снежок','NGC7789':'Роза Каролины','IC1396':'Комплекс IC 1396','IC1805':'Сердце','IC1848':'Душа','IC405':'Пылающая Звезда','IC5146':'Кокон','B33':'Конская Голова',
}
EXTRA = '''NGC40 NGC147 NGC185 NGC246 NGC281 NGC457 NGC663 NGC752 NGC869 NGC884 NGC891 NGC1023 NGC1499 NGC1501 NGC1502 NGC1514 NGC1528 NGC1535 NGC1647 NGC1907 NGC1931 NGC1977 NGC2022 NGC2024 NGC2158 NGC2237 NGC2244 NGC2261 NGC2264 NGC2392 NGC2403 NGC2683 NGC2841 NGC2903 NGC3079 NGC3184 NGC3242 NGC3344 NGC3521 NGC3628 NGC4236 NGC4244 NGC4449 NGC4490 NGC4565 NGC4631 NGC4656 NGC4725 NGC5005 NGC5033 NGC5466 NGC5866 NGC5907 NGC5981 NGC5982 NGC5985 NGC6207 NGC6210 NGC6229 NGC6503 NGC6543 NGC6572 NGC6633 NGC6712 NGC6781 NGC6826 NGC6888 NGC6905 NGC6939 NGC6940 NGC6946 NGC6960 NGC6992 NGC7000 NGC7008 NGC7023 NGC7027 NGC7129 NGC7331 NGC7479 NGC7662 NGC7789 IC1396 IC1805 IC1848 IC405 IC410 IC5146 B33'''.split()

def canonical(name):
    match = re.fullmatch(r'([A-Za-z]+)0*(\d+)(.*)', name)
    return f'{match[1]}{int(match[2])}{match[3]}' if match else name

def number(x):
    try: return float(x)
    except (ValueError, TypeError): return None

def ra_degrees(value):
    h, m, s = map(float, value.split(':'))
    return round((h + m/60 + s/3600)*15, 6)

def dec_degrees(value):
    d, m, s = map(float, value.lstrip('+-').split(':'))
    return round((d + m/60 + s/3600)*(-1 if value.startswith('-') else 1), 6)

def label(value):
    return re.sub(r'^([A-Za-z]+)(\d+)', r'\1 \2', value)

rows = []
for filename in ('NGC.csv', 'addendum.csv'):
    rows += list(csv.DictReader((HERE/filename).open(), delimiter=';'))
catalog = []
for r in rows:
    key = canonical(r['Name'])
    if not (r['M'] or key in EXTRA) or r['Type'] in ('Dup','NonEx') or not r['RA'] or not r['Dec']:
        continue
    original_key = key
    m = f"M{int(r['M'])}" if r['M'] else None
    if m == 'M45': key = 'M45'
    aliases = [label(key)]
    if original_key != key: aliases.append(label(original_key))
    if m and m != key: aliases += [label(m)]
    for s in (r.get('Identifiers','').split(',') if r.get('Identifiers') else []):
        if s.startswith(('C ','UGC ','PGC ','SH 2-','Mel ','Cr ','Barnard ')): aliases.append(s)
    typ = TYPES.get(r['Type'], 'special')
    if key == 'IC1396': typ = 'emission'
    if key == 'NGC7023': typ = 'reflection'
    obj = dict(id=key, name=label(m or key), commonName=COMMON.get(m,COMMON.get(key,'')), aliases=aliases,
        type=typ, constellation=CONST.get(r['Const'],r['Const']), ra=ra_degrees(r['RA']),dec=dec_degrees(r['Dec']),
        magnitude=number(r['V-Mag'] or r['B-Mag']), magBand='V' if r['V-Mag'] else 'B' if r['B-Mag'] else None,
        major=number(r['MajAx']), minor=number(r['MinAx']), positionAngle=number(r['PosAng']),
        surfaceBrightness=number(r['SurfBr']), sbBand='B' if r['SurfBr'] else None,
        description=TYPE_TEXT[typ], source='https://github.com/mattiaverga/OpenNGC',sourceName='OpenNGC',
        messier=int(r['M']) if r['M'] else None, catalogType=r['Type'])
    if key == 'NGC5866':
        obj['aliases'].append('M 102')
        obj['commonName']='Веретено'
        obj['description']='Линзовидная галактика, видимая почти с ребра. Часто отождествляется с историческим объектом M 102; это обозначение неоднозначно.'
    if key == 'M40': obj['description']='Оптическая двойная звезда, попавшая в каталог Мессье. В телескоп ищите пару звёзд, а не туманность.'
    if m == 'M73': obj['type']='special'; obj['description']='Небольшой звёздный астеризм из четырёх звёзд. Это не физически связанное рассеянное скопление.'
    if m == 'M24': obj['type']='special'; obj['description']='Звёздное облако Млечного Пути: участок, где межзвёздная пыль меньше закрывает фоновые звёзды. Для обзора нужно широкое поле.'
    catalog.append(obj)

catalog += [
    dict(id='HD226868',name='Лебедь X-1',commonName='Звезда у чёрной дыры',aliases=['HD 226868','HDE 226868','Cygnus X-1','Cyg X-1','HIP 98298','V1357 Cyg'],
        type='special',constellation='Лебедь',ra=299.590316,dec=35.201607,magnitude=8.91,magBand='V',major=None,minor=None,positionAngle=None,surfaceBrightness=None,sbBand=None,
        description='Видимая звезда HD 226868 — сверхгигант в двойной системе с чёрной дырой Лебедь X-1. В окуляре наблюдается звезда-компаньон; саму чёрную дыру увидеть нельзя.',source='https://simbad.cds.unistra.fr/simbad/sim-id?Ident=HD+226868',sourceName='SIMBAD / CDS',messier=None,catalogType='HXB'),
    dict(id='3C273',name='3C 273',commonName='Квазар в Деве',aliases=['3C 273','HIP 60936','PG 1226+023','QSO B1226+023'],type='quasar',constellation='Дева',
        ra=187.277916,dec=2.052388,magnitude=12.74,magBand='V',major=None,minor=None,positionAngle=None,surfaceBrightness=None,sbBand=None,
        magnitudeRange=[12.20,13.57],magnitudeNote='Переменный объект. V=12,74 — каталожное измерение APASS DR9, не текущая яркость; диапазон VSX 12,20–13,57 V.',
        description='Один из самых ярких оптических квазаров. В любительский телескоп выглядит слабой звездой; отличить его можно по точному положению. Яркость переменная.',
        source='https://vsx.aavso.org/index.php?oid=185255&view=detail.top',sourceName='AAVSO VSX / APASS DR9; SIMBAD',positionSource='https://simbad.cds.unistra.fr/simbad/sim-id?Ident=3C+273',messier=None,catalogType='QSO'),
]
extension_path=HERE/'catalog-extension.json'
if extension_path.exists():
    existing_ids={o['id'] for o in catalog}
    catalog += [o for o in json.loads(extension_path.read_text()) if o['id'] not in existing_ids]
specific_labels=json.loads((HERE/'object-labels.json').read_text()) if (HERE/'object-labels.json').exists() else {}
for obj in catalog: obj.update(specific_labels.get(obj['id'],{}))
catalog.sort(key=lambda o:(o['messier'] is None,o['messier'] or 0,o['id']))
assert len({x['id'] for x in catalog}) == len(catalog)
assert all(0<=x['ra']<360 and -90<=x['dec']<=90 for x in catalog)

def write(filename, data):
    (OUT/filename).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')

write('catalog.json',catalog)
if (HERE/'details-source.json').exists():
    details=json.loads((HERE/'details-source.json').read_text())
    assert set(details).issubset({x['id'] for x in catalog})
    write('details.json',details)

# Keep a complete bright-star backdrop and denser finder fields near targets.
# This is NOT a complete sky catalogue to magnitude 9.5; report field limit in UI.
target_vectors = []
for o in catalog:
    a,d=map(math.radians,(o['ra'],o['dec']))
    target_vectors.append((math.cos(a)*math.cos(d),math.sin(a)*math.cos(d),math.sin(d),o['dec']))
threshold=math.cos(math.radians(2.5))
stars=[]
for r in csv.DictReader((HERE/'HYG.csv').open()):
    if r['id']=='0' or not r['mag']: continue
    mag=float(r['mag'])
    if mag>9.5: continue
    ra,dec=float(r['ra'])*15,float(r['dec'])
    keep=mag<=7.0
    if not keep:
        a,d=map(math.radians,(ra,dec)); x,y,z=math.cos(a)*math.cos(d),math.sin(a)*math.cos(d),math.sin(d)
        keep=any(abs(dec-td)<=2.5 and x*tx+y*ty+z*tz>=threshold for tx,ty,tz,td in target_vectors)
    if not keep: continue
    name=r['proper'] or ((r['bf'].strip() or r['bayer']+' '+r['con']).strip() if mag<=6.5 else '')
    if name==r['con']: name=''
    stars.append([round(ra,4),round(dec,4),round(mag,2),name,int(r['hip']) if r['hip'] else 0])
stars.sort(key=lambda s:s[2])
write('stars.json',stars)

sources=[
    dict(id='openngc',title='OpenNGC',author='Mattia Verga and contributors',url='https://github.com/mattiaverga/OpenNGC',license='CC BY-SA 4.0',licenseUrl='https://creativecommons.org/licenses/by-sa/4.0/',files=['catalog.json'],changes='Selected objects; normalized identifiers; added Russian names/descriptions. B-band surface brightness preserved as B. Missing values remain null.',snapshot='2026-11-02'),
    dict(id='hyg',title='HYG Database v4.1',author='David Nash / Astronomy Nexus',url='https://github.com/astronexus/HYG-Database',license='CC BY-SA 4.0',licenseUrl='https://creativecommons.org/licenses/by-sa/4.0/',files=['stars.json'],changes='Sun removed. All entries mag≤7.0 plus entries mag≤9.5 within 2.5° of selected targets; positions rounded to 0.0001°. Columns: ra_deg,dec_deg,Vmag,label,HIP (0 if absent). HYG positions are J2000, fixed-position finder charts; proper motion is not propagated.',count=len(stars),snapshot='2026-11-02'),
    dict(id='simbad',title='SIMBAD Astronomical Database',author='CDS, Strasbourg Observatory, France',url='https://simbad.cds.unistra.fr',files=['catalog.json'],changes='Positions of HD 226868 and 3C 273; V photometry of HD 226868. Catalogue snapshots, not live measurements.',snapshot='2026-11-02'),
    dict(id='vsx',title='AAVSO VSX / APASS DR9: 3C 273',author='AAVSO',url='https://vsx.aavso.org/index.php?oid=185255&view=detail.top',files=['catalog.json'],changes='V=12.74 from APASS DR9 and reported V variability range 12.20–13.57. Not a prediction of present brightness.',snapshot='2026-11-02'),
]
if extension_path.exists():
    sources.append(dict(id='visual-extension',title='Popular visual targets extension',url='https://github.com/mattiaverga/OpenNGC',license='CC BY-SA 4.0',files=['catalog.json','details.json'],snapshot='2026-11-05',count=len(json.loads(extension_path.read_text()))))
# The planetarium builders own the credits for their separate star catalogue.
previous_sources = OUT / 'sources.json'
if previous_sources.exists() and (OUT / 'sky-stars.json').exists():
    sources.extend(item for item in json.loads(previous_sources.read_text())
                   if item.get('id') in ('hyg-planetarium', 'gaia-deep-fields'))
write('sources.json',sources)
print(json.dumps({'objects':len(catalog),'stars':len(stars),'starsBytes':(OUT/'stars.json').stat().st_size,'messierNumbers':len({x['messier'] for x in catalog if x['messier']}),'missingMessier':'M102 is historically ambiguous; NGC5866 carries M102 as alias.'}))
