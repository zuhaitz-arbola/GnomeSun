/**
 * prefs.js — GnomeSun Preferences Window (Libadwaita)
 *
 * Uses Adw.PreferencesPage with spin-row widgets for latitude,
 * longitude and refresh interval.  No default values are pre-filled
 * for coordinates — the user must enter them manually.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use strict";

import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import Gio from "gi://Gio";
import {
    ExtensionPreferences,
    gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class GnomeSunPreferences extends ExtensionPreferences {

    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        /* ============================================================ */
        /*  Location page                                               */
        /* ============================================================ */

        const locationPage = new Adw.PreferencesPage({
            title: _('Location'),
            icon_name: 'find-location-symbolic',
        });
        window.add(locationPage);

        /* --- Coordinates group --- */
        const coordGroup = new Adw.PreferencesGroup({
            title: _('Geographic Coordinates'),
            description: _('Enter your latitude and longitude in decimal degrees.'),
        });
        locationPage.add(coordGroup);

        /* Latitude (-90 … +90). */
        const latAdj = new Gtk.Adjustment({
            lower: -90,
            upper: 90,
            step_increment: 0.1,
            page_increment: 1,
            value: this._clampedLat(settings),
        });
        const latRow = new Adw.SpinRow({
            title: _('Latitude'),
            subtitle: _('North positive, south negative (−90 … +90)'),
            adjustment: latAdj,
            digits: 4,
        });
        coordGroup.add(latRow);

        /* Longitude (-180 … +180). */
        const lonAdj = new Gtk.Adjustment({
            lower: -180,
            upper: 180,
            step_increment: 0.1,
            page_increment: 1,
            value: this._clampedLon(settings),
        });
        const lonRow = new Adw.SpinRow({
            title: _('Longitude'),
            subtitle: _('East positive, west negative (−180 … +180)'),
            adjustment: lonAdj,
            digits: 4,
        });
        coordGroup.add(lonRow);

        /* Bind spin rows → GSettings (two-way). */
        latAdj.connect('value-changed', () => {
            settings.set_double('latitude', latAdj.get_value());
        });
        lonAdj.connect('value-changed', () => {
            settings.set_double('longitude', lonAdj.get_value());
        });

        /* ============================================================ */
        /*  General page                                                */
        /* ============================================================ */

        const generalPage = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(generalPage);

        /* --- Refresh group --- */
        const refreshGroup = new Adw.PreferencesGroup({
            title: _('Refresh'),
            description: _('Control how often the solar position is recalculated.'),
        });
        generalPage.add(refreshGroup);

        const intervalAdj = new Gtk.Adjustment({
            lower: 10,
            upper: 600,
            step_increment: 10,
            page_increment: 60,
            value: settings.get_int('refresh-interval'),
        });
        const intervalRow = new Adw.SpinRow({
            title: _('Refresh interval (seconds)'),
            subtitle: _('Lower values increase CPU usage slightly'),
            adjustment: intervalAdj,
            digits: 0,
        });
        refreshGroup.add(intervalRow);

        intervalAdj.connect('value-changed', () => {
            settings.set_int('refresh-interval', intervalAdj.get_value());
        });

        /* --- About group --- */
        const aboutGroup = new Adw.PreferencesGroup({
            title: _('About'),
        });
        generalPage.add(aboutGroup);

        const aboutRow = new Adw.ActionRow({
            title: 'GnomeSun',
            subtitle: _("Solar position tracker inspired by WMSun"),
        });
        aboutRow.add_suffix(new Gtk.Image({
            icon_name: 'weather-clear-symbolic',
            pixel_size: 32,
        }));
        aboutGroup.add(aboutRow);

        const creditRow = new Adw.ActionRow({
            title: _('Credits'),
            subtitle: _("Original idea by Alberto Viniegra Ilarregi, created with Google's Antigravity and VSCodium"),
        });
        aboutGroup.add(creditRow);

        /* ============================================================ */
        /*  Window sizing                                               */
        /* ============================================================ */

        window.set_default_size(460, 520);
    }

    /**
     * Return the stored latitude, clamped to the valid range.
     * The sentinel value 91.0 (= unconfigured) is mapped to 0.
     */
    _clampedLat(settings) {
        const v = settings.get_double('latitude');
        return (v >= -90 && v <= 90) ? v : 0;
    }

    /** Same for longitude (sentinel 181.0 → 0). */
    _clampedLon(settings) {
        const v = settings.get_double('longitude');
        return (v >= -180 && v <= 180) ? v : 0;
    }
}
