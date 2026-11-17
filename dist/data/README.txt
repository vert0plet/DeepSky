DeepSky offline astronomical data — catalogue and guide data

catalog.json
306 objects. OpenNGC NGC/IC data and selected addendum entries, plus HD226868
and 3C273. Coordinates are decimal degrees in J2000/ICRS. Angular major/minor
axes are in arcminutes, positionAngle is degrees north through east.
Missing values remain null. Never interpret null as magnitude 0.
Photometric magnitude retains its band: V when available, B as fallback.
OpenNGC surfaceBrightness is the mean B-band surface brightness within the
25-mag isophote, in mag/arcsec^2; it is NOT directly a V-band or SQM value.
Some catalogue angular sizes originate in infrared measurements; they are
not a promise of an object's visual dimensions through a telescope.

IDs are stable normalized catalogue identifiers (NGC224, NGC6503, IC1396,
M40, M45, B33, HD226868, 3C273). A Messier object's display name may be M 31,
while its canonical ID remains NGC224. Search aliases contain both forms.
109 unambiguous Messier objects are present. NGC5866 additionally carries
M 102 as an alias, with the historical identification ambiguity stated.
Special entries M24, M40 and M73 retain their actual nature (star cloud,
optical double star and asterism), rather than being called true clusters.

3C273 has variable V brightness. 12.74 is the APASS DR9 catalogue value
reported by AAVSO VSX; the VSX range is 12.20–13.57 V. This is not current
photometry. HD226868 V=8.91 and both special-object positions are from CDS
SIMBAD. Cygnus X-1's visible target is its stellar companion HD226868.

stars.json
Bare array of 25,158 packed star arrays:
  [raDegreesJ2000, decDegreesJ2000, Vmag, displayLabel, HIPnumber]
HIPnumber is 0 where absent. Labels are HYG names/Bayer-Flamsteed strings;
empty labels are intentional. The Sun is excluded.
Contains all HYG v4.1 entries with magnitude <=7.0 plus entries <=9.5 within
2.5 degrees of any selected catalogue target. This is NOT a complete
all-sky catalogue to 9.5m. The map is a finder aid, not an exhaustive
eyepiece star field. Proper motion has not been propagated after J2000.
3C273 needs a deeper external comparison chart for final identification.

details.json
Original concise Russian descriptions, visual expectations, tips and
primary-source links for selected objects. Visual notes are qualitative
guidance, not a calibrated telescope simulation or guaranteed detection.

Rebuild
  python3 scripts/build-data.py
The script downloads upstream CSVs when not cached in scripts/. Source
CSV caches are gitignored; only the compact derived data is distributed.

Attribution and license
OpenNGC: Mattia Verga and contributors, https://github.com/mattiaverga/OpenNGC
HYG Database v4.1: David Nash / Astronomy Nexus,
https://github.com/astronexus/HYG-Database
These catalogue-derived data are adapted under CC BY-SA 4.0:
https://creativecommons.org/licenses/by-sa/4.0/
Full license text: CC-BY-SA-4.0.txt. Changes and individual supplemental
sources are documented in sources.json. CDS acknowledgement: This research
has made use of the SIMBAD database, operated at CDS, Strasbourg, France.
