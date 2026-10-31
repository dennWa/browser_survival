# Python-Pakete (offline)

Vorab heruntergeladene Wheels für die Asset-Pipeline (`werkzeuge/assets/baue_assets.py` braucht `py7zr` zum Entpacken von .7z-Paketen),
damit die Installation auch ohne Internet bzw. hinter strengen Proxys klappt (Python 3.13, Linux x86_64):

    pip install --no-index --find-links werkzeuge/python-pakete py7zr

Mit Internet reicht `pip install -r werkzeuge/assets/anforderungen.txt`. (Früher lagen die Dateien im Hauptordner – Runde 27 hierher verschoben.)
