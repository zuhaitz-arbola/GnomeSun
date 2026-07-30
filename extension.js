/**
 * extension.js — GnomeSun GNOME Shell Extension
 *
 * Renders the current solar position in the top panel using
 * St.DrawingArea + Cairo, and shows a detailed sky-dome diagram
 * with azimuth, elevation, sunrise/sunset data in a popup menu.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import GLib   from 'gi://GLib';
import GObject from 'gi://GObject';
import St     from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio    from 'gi://Gio';

import * as Main      from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

/* Local solar calculation module. */
import * as Solar from './solar.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TWO_PI = 2 * Math.PI;
const DEG    = Math.PI / 180;

/* Panel icon dimensions. */
const ICON_W = 22;
const ICON_H = 22;

/* Sky-dome popup dimensions. */
const DOME_W = 290;
const DOME_H = 240;

/* Number of trajectory sample points (every 10 min = 144). */
const TRAJ_STEPS = 144;

/* ------------------------------------------------------------------ */
/*  Colour palette                                                     */
/* ------------------------------------------------------------------ */

const C = {
    /* Background / dome (Pure Black #000000) */
    domeBg:     [0.00, 0.00, 0.00, 1.0],
    domeRing:   [0.56, 0.58, 0.65, 0.50],
    domeGrid:   [0.56, 0.58, 0.65, 0.25],

    /* Compass labels (Pure White #FFFFFF) */
    compass:    [1.00, 1.00, 1.00, 0.95],

    /* Trajectory arc (Pure White) */
    trajDay:    [1.00, 1.00, 1.00, 0.70],
    trajNight:  [0.56, 0.58, 0.65, 0.20],

    /* Current sun dot (Pure White) */
    sunCore:    [1.00, 1.00, 1.00, 1.0],
    sunGlow:    [1.00, 1.00, 1.00, 0.35],
    sunNight:   [0.56, 0.58, 0.65, 0.60],

    /* Panel icon (Pure White) */
    panelHorizon: [0.56, 0.58, 0.65, 0.70],
    panelSunDay:  [1.00, 1.00, 1.00, 1.0],
    panelSunNite: [0.56, 0.58, 0.65, 0.50],
    panelGlow:    [1.00, 1.00, 1.00, 0.35],

    /* Elevation arcs labels (Unified Gray #8E95A5) */
    elevLabel:  [0.56, 0.58, 0.65, 0.60],
};

/* ------------------------------------------------------------------ */
/*  SunIndicator — PanelMenu.Button subclass                           */
/* ------------------------------------------------------------------ */

const SunIndicator = GObject.registerClass(
class SunIndicator extends PanelMenu.Button {

    _init(ext) {
        super._init(0.5, 'GnomeSun');

        this._ext      = ext;
        this._settings = ext.getSettings();
        this._solarData = null;
        this._timerId   = 0;

        /* ----- Panel icon (DrawingArea) ----- */
        this._panelIcon = new St.DrawingArea({
            style_class: 'gnomesun-panel-icon',
            width:  ICON_W,
            height: ICON_H,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._panelIcon.connect('repaint', (area) => this._drawPanelIcon(area));
        this.add_child(this._panelIcon);

        /* ----- Popup menu ----- */
        this._buildPopupMenu();

        /* ----- Settings signals ----- */
        this._settingsIds = [];
        this._settingsIds.push(
            this._settings.connect('changed::latitude',         () => this._update()),
            this._settings.connect('changed::longitude',        () => this._update()),
            this._settings.connect('changed::refresh-interval', () => this._restartTimer()),
        );

        /* ----- Initial update & timer ----- */
        this._update();
        this._startTimer();
    }

    /* ============================================================== */
    /*  Popup menu construction                                        */
    /* ============================================================== */

    _buildPopupMenu() {
        /* Sky-dome diagram. */
        this._domeArea = new St.DrawingArea({
            style_class: 'gnomesun-sky-dome',
            width:  DOME_W,
            height: DOME_H,
        });
        this._domeArea.connect('repaint', (area) => this._drawSkyDome(area));

        const domeItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        domeItem.add_child(this._domeArea);
        this.menu.addMenuItem(domeItem);

        /* Separator. */
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        /* Status badge (day / night / unconfigured). */
        this._statusLabel = new St.Label({
            style_class: 'gnomesun-day-badge',
            x_expand: true,
        });
        const statusItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        statusItem.add_child(this._statusLabel);
        this.menu.addMenuItem(statusItem);

        /* Info rows container. */
        this._infoBox = new St.BoxLayout({
            vertical: true,
            style_class: 'gnomesun-info-box',
            x_expand: true,
        });
        const infoItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        infoItem.add_child(this._infoBox);
        this.menu.addMenuItem(infoItem);

        /* Pre-create info row widgets. */
        this._rows = {};
        const fields = [
            ['sunrise',    _('Sunrise')],
            ['sunset',     _('Sunset')],
            ['solarNoon',  _('Solar Noon')],
            ['dayLength',  _('Day Length')],
            ['elevation',  _('Elevation')],
            ['azimuth',    _('Azimuth')],
        ];
        for (const [key, label] of fields) {
            const row = new St.BoxLayout({style_class: 'gnomesun-info-row', x_expand: true});
            const lbl = new St.Label({style_class: 'gnomesun-info-label', text: label});
            const val = new St.Label({style_class: 'gnomesun-info-value', text: '—'});
            row.add_child(lbl);
            row.add_child(val);
            this._infoBox.add_child(row);
            this._rows[key] = val;
        }

        /* Separator before settings button. */
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        /* "Settings" action. */
        const settingsItem = new PopupMenu.PopupMenuItem(_('Settings'));
        settingsItem.connect('activate', () => {
            this._ext.openPreferences();
        });
        this.menu.addMenuItem(settingsItem);
    }

    /* ============================================================== */
    /*  Timer management                                               */
    /* ============================================================== */

    _startTimer() {
        if (this._timerId)
            return;
        const interval = this._settings.get_int('refresh-interval');
        this._timerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, interval, () => {
                this._update();
                return GLib.SOURCE_CONTINUE;
            },
        );
    }

    _stopTimer() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
    }

    _restartTimer() {
        this._stopTimer();
        this._startTimer();
    }

    /* ============================================================== */
    /*  Data update                                                    */
    /* ============================================================== */

    _isConfigured() {
        const lat = this._settings.get_double('latitude');
        const lon = this._settings.get_double('longitude');
        return (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180);
    }

    _update() {
        if (!this._isConfigured()) {
            this._solarData = null;
            this._statusLabel.set_style_class_name('gnomesun-status-label');
            this._statusLabel.set_text(_('Coordinates not configured'));
            this._infoBox.hide();
        } else {
            const lat = this._settings.get_double('latitude');
            const lon = this._settings.get_double('longitude');
            this._solarData = Solar.getSolarData(lat, lon, new Date());

            /* Update status badge. */
            if (this._solarData.polarDay) {
                this._statusLabel.set_style_class_name('gnomesun-day-badge');
                this._statusLabel.set_text(`☀  ${_('Polar day (sun does not set)')}`);
            } else if (this._solarData.polarNight) {
                this._statusLabel.set_style_class_name('gnomesun-night-badge');
                this._statusLabel.set_text(`☾  ${_('Polar night (sun does not rise)')}`);
            } else if (this._solarData.elevation > 0) {
                this._statusLabel.set_style_class_name('gnomesun-day-badge');
                this._statusLabel.set_text(`☀  ${_('Sun above horizon')}`);
            } else {
                this._statusLabel.set_style_class_name('gnomesun-night-badge');
                this._statusLabel.set_text(`☾  ${_('Sun below horizon')}`);
            }

            /* Update info rows. */
            this._infoBox.show();
            const d = this._solarData;
            this._rows.elevation.set_text(`${d.elevation.toFixed(2)}°`);
            this._rows.azimuth.set_text(`${d.azimuth.toFixed(2)}°`);
            this._rows.sunrise.set_text(d.sunrise  ?? '—');
            this._rows.sunset.set_text(d.sunset   ?? '—');
            this._rows.solarNoon.set_text(d.solarNoon ?? '—');
            this._rows.dayLength.set_text(d.dayLength ?? '—');
        }

        /* Trigger Cairo repaints. */
        this._panelIcon.queue_repaint();
        this._domeArea.queue_repaint();
    }

    /* ============================================================== */
    /*  Cairo: panel icon (small sun + horizon)                        */
    /* ============================================================== */

_drawPanelIcon(area) {
        const cr  = area.get_context();
        const [w, h] = area.get_surface_size();

        const cx = w / 2;
        const cy = h / 2;
        
        /* --- Nuevas proporciones: Sol dominante, rayos sutiles --- */
        // El radio del sol es grande para ocupar el panel (max ~11)
        const sunR = 7.0;  

        /* Clear canvas. */
        cr.setOperator(0);   // CLEAR
        cr.paint();
        cr.setOperator(2);   // OVER

        if (!this._solarData) {
            // Dim placeholder if unconfigured
            cr.setSourceRGBA(1.0, 1.0, 1.0, 0.3);
            cr.arc(cx, cy, sunR * 0.6, 0, TWO_PI);
            cr.stroke();
            cr.$dispose();
            return;
        }

        const isDay = this._solarData.elevation > 0;
        // Force pure white for minimalist look
        cr.setSourceRGBA(1.0, 1.0, 1.0, 1.0);

        if (isDay) {
            /* Daytime: Solid large Sun disc */
            cr.arc(cx, cy, sunR, 0, TWO_PI);
            cr.fill();

            /* Daytime: 8 Minimalist Rays */
            // Los rayos deben ser pequeños en relación al sol grande
            cr.setLineWidth(1.2);
            const rLen = 1.5; // Longitud: la mitad del radio del sol (7.0)
            const rGap = 1.0; // Espacio muy pequeño desde el sol

            for (let a = 0; a < 8; a++) {
                const angle = a * Math.PI / 4;
                // Empezamos a dibujar justo fuera del sol
                const startDist = sunR + rGap;
                cr.moveTo(cx + Math.cos(angle) * startDist, cy + Math.sin(angle) * startDist);
                cr.lineTo(cx + Math.cos(angle) * (startDist + rLen), cy + Math.sin(angle) * (startDist + rLen));
                cr.stroke();
            }

        } else {
            /* Nighttime: Large Sun Outline (minimalist) */
            cr.setLineWidth(1.0);
            cr.arc(cx, cy, sunR, 0, TWO_PI);
            cr.stroke();
        }

        cr.$dispose();
    }

    /* ============================================================== */
    /*  Cairo: sky-dome popup diagram                                  */
    /* ============================================================== */

    /**
     * Map (azimuth, elevation) → (x, y) on the polar sky dome.
     *
     *   • Centre = zenith (elevation 90°)
     *   • Edge   = horizon (elevation 0°)
     *   • Azimuth 0° = North (top), 90° = East (right)
     */
    _domeXY(azimuth, elevation, cx, cy, radius) {
        const r = ((90 - Math.max(0, elevation)) / 90) * radius;
        const a = azimuth * DEG;
        return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    }

    _drawSkyDome(area) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();

        /* Clear. */
        cr.setOperator(0);
        cr.paint();
        cr.setOperator(2);

        /* Background. */
        cr.setSourceRGBA(...C.domeBg);
        /* Rounded rectangle (manual, since Clutter's Cairo has no built-in). */
        const bgR = 10;
        cr.newPath();
        cr.arc(bgR,     bgR,      bgR, Math.PI, 1.5 * Math.PI);
        cr.arc(w - bgR, bgR,      bgR, 1.5 * Math.PI, TWO_PI);
        cr.arc(w - bgR, h - bgR,  bgR, 0, 0.5 * Math.PI);
        cr.arc(bgR,     h - bgR,  bgR, 0.5 * Math.PI, Math.PI);
        cr.closePath();
        cr.fill();

        /* Dome geometry. */
        const cx = w / 2;
        const cy = h / 2 + 6;
        const radius = Math.min(w, h) / 2 - 32;

        /* ---- Horizon circle ---- */
        cr.setSourceRGBA(...C.domeRing);
        cr.setLineWidth(1.5);
        cr.arc(cx, cy, radius, 0, TWO_PI);
        cr.stroke();

        /* ---- Elevation circles (30° and 60°) ---- */
        cr.setSourceRGBA(...C.domeGrid);
        cr.setLineWidth(0.6);
        const dashes = [3, 3];
        cr.setDash(dashes, 0);
        cr.arc(cx, cy, radius * (2 / 3), 0, TWO_PI);   // 30°
        cr.stroke();
        cr.arc(cx, cy, radius * (1 / 3), 0, TWO_PI);   // 60°
        cr.stroke();
        cr.setDash([], 0);

        /* ---- Cross-hairs (N-S, E-W) ---- */
        cr.setSourceRGBA(...C.domeGrid);
        cr.setLineWidth(0.5);
        cr.moveTo(cx, cy - radius);
        cr.lineTo(cx, cy + radius);
        cr.stroke();
        cr.moveTo(cx - radius, cy);
        cr.lineTo(cx + radius, cy);
        cr.stroke();

        /* ---- Compass labels ---- */
        cr.setSourceRGBA(...C.compass);
        cr.selectFontFace('Sans', 0, 1);   // NORMAL, BOLD
        cr.setFontSize(10);

        let ext;
        const lblN = _('N');
        ext = cr.textExtents(lblN);
        cr.moveTo(cx - ext.width / 2, cy - radius - 6);
        cr.showText(lblN);

        const lblS = _('S');
        ext = cr.textExtents(lblS);
        cr.moveTo(cx - ext.width / 2, cy + radius + 14);
        cr.showText(lblS);

        const lblE = _('E');
        ext = cr.textExtents(lblE);
        cr.moveTo(cx + radius + 7, cy + ext.height / 2);
        cr.showText(lblE);

        const lblW = _('W');
        ext = cr.textExtents(lblW);
        cr.moveTo(cx - radius - 7 - ext.width, cy + ext.height / 2);
        cr.showText(lblW);

        /* ---- Elevation labels (30°, 60°) ---- */
        cr.setSourceRGBA(...C.elevLabel);
        cr.selectFontFace('Sans', 0, 0);   // NORMAL, NORMAL
        cr.setFontSize(8);
        cr.moveTo(cx + 3, cy - radius * (1 / 3) + 10);
        cr.showText('60°');
        cr.moveTo(cx + 3, cy - radius * (2 / 3) + 10);
        cr.showText('30°');

        if (!this._solarData) {
            /* No data — draw "?" in centre. */
            cr.setSourceRGBA(0.6, 0.6, 0.6, 0.5);
            cr.selectFontFace('Sans', 0, 1);
            cr.setFontSize(28);
            ext = cr.textExtents('?');
            cr.moveTo(cx - ext.width / 2, cy + ext.height / 2);
            cr.showText('?');
            cr.$dispose();
            return;
        }

        /* ---- Sun trajectory for the day ---- */
        const lat = this._settings.get_double('latitude');
        const lon = this._settings.get_double('longitude');
        const now = new Date();

        /* Collect trajectory points for the day. */
        const points = [];
        for (let i = 0; i <= TRAJ_STEPS; i++) {
            const min = i * (1440 / TRAJ_STEPS);
            const pos = Solar.positionAtMinute(lat, lon, now, min);
            points.push(pos);
        }

        /* Above-horizon trajectory arc. */
        let firstAbove = true;
        cr.setSourceRGBA(...C.trajDay);
        cr.setLineWidth(2.0);
        firstAbove = true;
        for (const p of points) {
            if (p.elevation < 0) {
                if (!firstAbove) cr.stroke();
                firstAbove = true;
                continue;
            }
            const [x, y] = this._domeXY(p.azimuth, p.elevation, cx, cy, radius);
            if (firstAbove) { cr.moveTo(x, y); firstAbove = false; }
            else             { cr.lineTo(x, y); }
        }
        if (!firstAbove) cr.stroke();

        /* ---- Current sun position (only above horizon) ---- */
        const sd    = this._solarData;
        const isDay = sd.elevation > 0;

        if (isDay) {
            const [sunX, sunY] = this._domeXY(sd.azimuth, sd.elevation, cx, cy, radius);

            /* Outer glow. */
            cr.setSourceRGBA(...C.sunGlow);
            cr.arc(sunX, sunY, 10, 0, TWO_PI);
            cr.fill();
            cr.setSourceRGBA(...C.sunGlow);
            cr.arc(sunX, sunY, 6, 0, TWO_PI);
            cr.fill();

            /* Core dot. */
            cr.setSourceRGBA(...C.sunCore);
            cr.arc(sunX, sunY, 4.5, 0, TWO_PI);
            cr.fill();

            /* Tiny cross-hair. */
            cr.setSourceRGBA(1.0, 1.0, 1.0, 0.45);
            cr.setLineWidth(0.6);
            cr.moveTo(sunX - 7, sunY);
            cr.lineTo(sunX + 7, sunY);
            cr.stroke();
            cr.moveTo(sunX, sunY - 7);
            cr.lineTo(sunX, sunY + 7);
            cr.stroke();
        }

        cr.$dispose();
    }

    /* ============================================================== */
    /*  Cleanup                                                        */
    /* ============================================================== */

    destroy() {
        this._stopTimer();
        for (const id of this._settingsIds)
            this._settings.disconnect(id);
        this._settingsIds = [];
        super.destroy();
    }
});

/* ================================================================== */
/*  Extension entry point                                              */
/* ================================================================== */

export default class GnomeSunExtension extends Extension {

    enable() {
        this._indicator = new SunIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
