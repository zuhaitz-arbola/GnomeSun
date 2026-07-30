# GnomeSun ☀

**GnomeSun** is a GNOME Shell extension that displays the real-time solar position in the top panel, inspired by Window Maker's classic [WMSun](https://www.dockapps.net/wmsun) applet.

It offline-calculates the sunrise, sunset, solar noon, day length, elevation, and azimuth using astronomical equations (NOAA Solar Calculator) based on your local coordinates. No external web requests are ever made.

---

## Features

- **Top Bar Icon**: Minimalist solar indicator showing current solar altitude relative to the horizon.
- **Detailed Sky Dome**: Center-projected polar chart illustrating the sun's path during the day and its current coordinate position.
- **Astronomic Information**: Detailed calculations of sunrise, sunset, solar noon, day length, elevation, and azimuth.
- **Completely Offline**: Runs 100% locally to protect your privacy and ensure lightweight resource utilization.

---

## Supported Languages (44 languages)

GnomeSun is fully translated into the following languages:

- **Arabic** (`ar`)
- **Basque** (`eu`)
- **Belarusian** (`be`)
- **Brazilian Portuguese** (`pt_BR`)
- **Bulgarian** (`bg`)
- **Catalan** (`ca`)
- **Croatian** (`hr`)
- **Czech** (`cs`)
- **Danish** (`da`)
- **Dutch** (`nl`)
- **English** (`en`)
- **Esperanto** (`eo`)
- **Estonian** (`et`)
- **Finnish** (`fi`)
- **French** (`fr`)
- **Galician** (`gl`)
- **German** (`de`)
- **Greek** (`el`)
- **Hebrew** (`he`)
- **Hindi** (`hi`)
- **Hungarian** (`hu`)
- **Indonesian** (`id`)
- **Italian** (`it`)
- **Japanese** (`ja`)
- **Korean** (`ko`)
- **Latvian** (`lv`)
- **Lithuanian** (`lt`)
- **Norwegian Bokmål** (`nb`)
- **Persian** (`fa`)
- **Polish** (`pl`)
- **Portuguese** (`pt`)
- **Romanian** (`ro`)
- **Russian** (`ru`)
- **Serbian** (`sr`)
- **Simplified Chinese** (`zh_CN`)
- **Slovak** (`sk`)
- **Slovenian** (`sl`)
- **Spanish** (`es`)
- **Swedish** (`sv`)
- **Thai** (`th`)
- **Traditional Chinese** (`zh_TW`)
- **Turkish** (`tr`)
- **Ukrainian** (`uk`)
- **Vietnamese** (`vi`)

---

## Installation

Copy the extension directory to your GNOME Shell extensions directory:

```bash
cp -r . ~/.local/share/gnome-shell/extensions/gnomesun@ortzi.org
```

---

## Activation

### Via terminal:

```bash
gnome-extensions enable gnomesun@ortzi.org
```

### Via GUI:
Open **GNOME Extensions** or **Extension Manager** and toggle *GnomeSun* on.

> **Note:** If on Wayland, you must log out and log back in to reload GNOME Shell before the extension becomes visible. On X11, you can restart it by typing `Alt+F2`, typing `r`, and hitting `Enter`.

---

## Configuration

1. Open the preferences of the extension (click on the gear icon in the Extensions app, or click *Settings* from the extension's top bar drop-down).
2. Enter your **latitude** and **longitude** in decimal degrees.
3. Configure the **refresh interval** (default is 60 seconds).

---

## License

GPL-3.0-or-later

---

## Credits

- Solar calculations based on equations from the [NOAA Solar Calculator](https://gml.noaa.gov/grad/solcalc/).
- Inspired by the classic [WMSun](https://www.dockapps.net/wmsun) Window Maker dockapp.
- Original idea by Alberto Viniegra Ilarregi, created with Google's Antigravity and VSCodium.
