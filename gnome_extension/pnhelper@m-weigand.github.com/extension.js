/*
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 *
 * Based on:
 * https://raw.githubusercontent.com/kosmospredanie/gnome-shell-extension-screen-autorotate/main/screen-autorotate%40kosmospredanie.yandex.ru/extension.js
 */
'use strict';
const St = imports.gi.St;
// const Gio = imports.gi.Gio;
const { GLib, Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
// const rotator = Me.imports.rotator;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Slider = imports.ui.slider;

const Orientation = Object.freeze({
    'normal': 0,
    'left-up': 1,
    'bottom-up': 2,
    'right-up': 3
});

// imports.searchPath.unshift('.');
const BusUtils = Me.imports.busUtils;

// function call_dbus_method(method, params = null) {
// 	log("pre get sync");
//     let connection = Gio.bus_get_sync(Gio.BusType.SESSION, null);
// 	log("post get sync");
//     return connection.call_sync(
//         'org.gnome.Mutter.DisplayConfig',
//         '/org/gnome/Mutter/DisplayConfig',
//         'org.gnome.Mutter.DisplayConfig',
//         method,
//         params,
//         null,
//         Gio.DBusCallFlags.NONE,
//         -1,
//         null);
// }

// function get_state() {
//     let result = call_dbus_method('GetCurrentState');
//     return new BusUtils.DisplayConfigState(result);
// }

// function rotate_to(transform) {
//     let state = this.get_state();
//     let builtin_monitor = state.builtin_monitor;
//     let logical_monitor = state.get_logical_monitor_for(builtin_monitor.connector);
//     logical_monitor.transform = transform;
//     let variant = state.pack_to_apply( BusUtils.Methods['temporary'] );
//     call_dbus_method('ApplyMonitorsConfig', variant);
// }


class Extension {
    constructor() {
        this._indicator = null;
        this._indicator2 = null;

		// the button widgets
		this.bw_but_grayscale = new PopupMenu.PopupMenuItem(_('Grayscale Mode (v2)'));
		this.bw_but_bw_dither = new PopupMenu.PopupMenuItem(_('BW+Dither Mode'));
		this.bw_but_bw = new PopupMenu.PopupMenuItem(_('BW Mode'));
        this.m_bw_slider = new PopupMenu.PopupBaseMenuItem({ activate: true });
		this.mitem_bw_dither_invert = new PopupMenu.PopupMenuItem(_('BW Invert On'));
    }

	_write_to_sysfs_file(filename, value){
		try {
			// The process starts running immediately after this function is called. Any
			// error thrown here will be a result of the process failing to start, not
			// the success or failure of the process itself.
			let proc = Gio.Subprocess.new(
				// The program and command options are passed as a list of arguments
				['/bin/sh', '-c', `echo ${value} > ` + filename],
					// /sys/module/drm/parameters/debug'],

				// The flags control what I/O pipes are opened and how they are directed
				Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
			);

			// Once the process has started, you can end it with `force_exit()`
			// proc.force_exit();
		} catch (e) {
			logError(e);
		}
	}

    _add_warm_indicator_to_main_gnome_menu() {
        let filepath = "/sys/class/backlight/backlight_warm/brightness";
        let max_filepath = "/sys/class/backlight/backlight_warm/max_brightness";

        this._m_warm_backlight_slider = new PopupMenu.PopupBaseMenuItem({ activate: true });
        this._warm_backlight_slider = new Slider.Slider(this._get_content(filepath) / this._get_content(max_filepath));
        this._sliderChangedId = this._warm_backlight_slider.connect('notify::value',
            this._warm_backlight_slider_changed.bind(this));
        this._warm_backlight_slider.accessible_name = _("Warm Backlight Brightness");

        const icon = new St.Icon({
            icon_name: 'weather-clear-night-symbolic',
            style_class: 'popup-menu-icon',
        });
        this._m_warm_backlight_slider.add(icon);
        this._m_warm_backlight_slider.add_child(this._warm_backlight_slider);
        this._m_warm_backlight_slider.connect('button-press-event', (actor, event) => {
            return this._warm_backlight_slider.startDragging(event);
        });
        this._m_warm_backlight_slider.connect('key-press-event', (actor, event) => {
            return this._warm_backlight_slider.emit('key-press-event', event);
        });
        this._m_warm_backlight_slider.connect('scroll-event', (actor, event) => {
            return this._warm_backlight_slider.emit('scroll-event', event);
        });

        Main.panel.statusArea.aggregateMenu.menu.addMenuItem(this._m_warm_backlight_slider, 2);
    }

    _warm_backlight_slider_changed() {
        let filepath = "/sys/class/backlight/backlight_warm/brightness";
        let max_filepath = "/sys/class/backlight/backlight_warm/max_brightness";
        let relative = this._warm_backlight_slider.value;
        const brightness = Math.round(relative * this._get_content(max_filepath));
        this._write_to_sysfs_file(filepath, brightness);
    }

	_change_bw_mode(new_mode){
		if (new_mode == 0){
			this.bw_but_grayscale.visible = false;
			this.bw_but_bw_dither.visible = true;
			this.bw_but_bw.visible = true;
			this.m_bw_slider.visible = false;
			this.mitem_bw_dither_invert.visible = false;
			// use GC16 waveform
			this._set_waveform(4);
		} else if (new_mode == 1){
			// bw+dither
			this.bw_but_grayscale.visible = true;
			this.bw_but_bw_dither.visible = false;
			this.bw_but_bw.visible = true;
			this.m_bw_slider.visible = false;
			this.mitem_bw_dither_invert.visible = true;
			// use A2 waveform
			this._set_waveform(1);
		} else if (new_mode == 2){
			// bw
			this.bw_but_grayscale.visible = true;
			this.bw_but_bw_dither.visible = true;
			this.bw_but_bw.visible = false;
			this.m_bw_slider.visible = true;
			this.mitem_bw_dither_invert.visible = true;
			// use A2 waveform
			this._set_waveform(1);
		}

		this._write_to_sysfs_file(
			'/sys/module/rockchip_ebc/parameters/bw_mode',
			new_mode
		);
	}

	_add_bw_buttons() {
		// add three buttons for grayscale, bw, bw+dithering modes

		// 1
		this.bw_but_grayscale.connect('activate', () => {
			this._change_bw_mode(0);
		});
		this._indicator.menu.addMenuItem(this.bw_but_grayscale);

		// 2
		this.bw_but_bw_dither.connect('activate', () => {
			this._change_bw_mode(1);
		});
		this._indicator.menu.addMenuItem(this.bw_but_bw_dither);

		// 3
		this.bw_but_bw.connect('activate', () => {
			this._change_bw_mode(2);
		});
		this._indicator.menu.addMenuItem(this.bw_but_bw);
	}

	_add_bw_slider() {
        // this.m_bw_slider = new PopupMenu.PopupBaseMenuItem({ activate: true });
		this._indicator.menu.addMenuItem(this.m_bw_slider);

        this._bw_slider = new Slider.Slider(0.5);
        this._sliderChangedId = this._bw_slider.connect('notify::value',
            this._bw_slider_changed.bind(this));
        this._bw_slider.accessible_name = _("BW Threshold");

        const icon = new St.Icon({
            icon_name: 'display-brightness-symbolic',
            style_class: 'popup-menu-icon',
        });
        this.m_bw_slider.add(icon);
        this.m_bw_slider.add_child(this._bw_slider);
        this.m_bw_slider.connect('button-press-event', (actor, event) => {
            return this._bw_slider.startDragging(event);
        });
        this.m_bw_slider.connect('key-press-event', (actor, event) => {
            return this._bw_slider.emit('key-press-event', event);
        });
        this.m_bw_slider.connect('scroll-event', (actor, event) => {
            return this._bw_slider.emit('scroll-event', event);
        });
	}

	_bw_slider_changed(){
		let bw_threshold;
		// transform to thresholds 1 to 7 in roughly similar-sized bins
		bw_threshold = 4 + Math.floor(this._bw_slider.value * 9);
		log(`new bw threshold: ${bw_threshold}`);
		this._write_to_sysfs_file(
			'/sys/module/rockchip_ebc/parameters/bw_threshold',
			bw_threshold
		);
	}

	_set_a1_waveform(){
		this._write_to_sysfs_file(
			'/sys/module/rockchip_ebc/parameters/default_waveform',
			1
		);
	}

	_set_waveform(waveform){
		this._write_to_sysfs_file(
			'/sys/module/rockchip_ebc/parameters/default_waveform',
			waveform
		);
	}

	_add_waveform_buttons(){
		let item;
		item = new PopupMenu.PopupMenuItem(_('A2 Waveform'));
		item.connect('activate', () => {
			this._set_waveform(1);
		});
		this._indicator.menu.addMenuItem(item);

		// item = new PopupMenu.PopupMenuItem(_('DU Waveform'));
		// item.connect('activate', () => {
		// 	this._set_waveform(2);
		// });
		// this._indicator.menu.addMenuItem(item);

		item = new PopupMenu.PopupMenuItem(_('GC16 Waveform'));
		item.connect('activate', () => {
			this._set_waveform(4);
		});
		this._indicator.menu.addMenuItem(item);

// 		item = new PopupMenu.PopupMenuItem(_('DU4 Waveform'));
// 		item.connect('activate', () => {
// 			this._set_waveform(7);
// 		});
// 		this._indicator.menu.addMenuItem(item);
	}

	_add_auto_refresh_button(){
		let filename = '/sys/module/rockchip_ebc/parameters/auto_refresh'
		let auto_refresh = this._get_content(filename);

		log(`add: auto refresh state: ${auto_refresh}`);

		if(auto_refresh == 'N'){
			this.mitem_auto_refresh = new PopupMenu.PopupMenuItem(_('Enable Autorefresh'));
		} else {
			this.mitem_auto_refresh = new PopupMenu.PopupMenuItem(_('Disable Autorefresh'));
		}
		this.mitem_auto_refresh.connect('activate', () => {
			this.toggle_auto_refresh();
		});

		this._indicator.menu.addMenuItem(this.mitem_auto_refresh);
	}

	toggle_auto_refresh(){
		log("Toggling atuo refresh");
		let filename = '/sys/module/rockchip_ebc/parameters/auto_refresh'
		let auto_refresh = this._get_content(filename);
		log(`toggle: auto refresh state: ${auto_refresh}`);

		if(auto_refresh == 'N'){
			auto_refresh = 1;
			this.mitem_auto_refresh.label.set_text('Disable Autorefresh');
		} else {
			auto_refresh = 0;
			this.mitem_auto_refresh.label.set_text('Enable Autorefresh');
		}

		this._write_to_sysfs_file(
			filename,
			auto_refresh
		);

	}

	_add_dither_invert_button(){
		let filename = '/sys/module/rockchip_ebc/parameters/bw_dither_invert'
		let bw_dither_invert = this._get_content(filename);

		if(bw_dither_invert == 'N'){
			this.mitem_bw_dither_invert.label.set_text('BW Invert On');
		} else {
			this.mitem_bw_dither_invert.label.set_text('BW Invert Off');
		}
		this.mitem_bw_dither_invert.connect('activate', () => {
			this.toggle_bw_dither_invert();
		});

		this._indicator.menu.addMenuItem(this.mitem_bw_dither_invert);
	}

	toggle_bw_dither_invert(){
		let filename = '/sys/module/rockchip_ebc/parameters/bw_dither_invert'
		let bw_dither_invert = this._get_content(filename);
		log(`Toggling dither invert (is: ${bw_dither_invert})`);

		if(bw_dither_invert == 0){
			bw_dither_invert = 1;
			this.mitem_bw_dither_invert.label.set_text('BW Invert Off');
		} else {
			bw_dither_invert = 0;
			this.mitem_bw_dither_invert.label.set_text('BW Invert On');
		}
		log(`new value: ${bw_dither_invert})`);

		this._write_to_sysfs_file(
			filename,
			bw_dither_invert
		);
	}

    enable() {
        log(`enabling ${Me.metadata.name}`);

		// ////////////////////////////////////////////////////////////////////
		// Button 1
        let indicatorName = `${Me.metadata.name} Indicator`;

        // Create a panel button
        this._indicator = new PanelMenu.Button(0.0, indicatorName, false);

        // Add an icon
        let icon = new St.Icon({
            //gicon: new Gio.ThemedIcon({name: 'face-laugh-symbolic'}),
            gicon: new Gio.ThemedIcon({name: 'org.gnome.SimpleScan-symbolic'}),
            style_class: 'system-status-icon'
        });
        this._indicator.add_child(icon);

        // `Main.panel` is the actual panel you see at the top of the screen,
        // not a class constructor.
        Main.panel.addToStatusArea(indicatorName, this._indicator);

		let item;
		item = new PopupMenu.PopupMenuItem(_('Rotate'));
		item.connect('activate', () => {
			this.rotate_screen();
		});
		this._indicator.menu.addMenuItem(item);

		this._add_warm_indicator_to_main_gnome_menu();
		this._add_bw_buttons();
		this._add_bw_slider();
		this._add_dither_invert_button();
		this._add_auto_refresh_button();
		this._add_waveform_buttons()

		// activate default grayscale mode
		this._change_bw_mode(0);
    }

	_get_content(sysfs_file){
		// read current value
		const file = Gio.File.new_for_path(sysfs_file);
		const [, contents, etag] = file.load_contents(null);
		const ByteArray = imports.byteArray;
		const contentsString = ByteArray.toString(contents);

		return contentsString.replace(/[\n\r]/g, '');
	}

    // REMINDER: It's required for extensions to clean up after themselves when
    // they are disabled. This is required for approval during review!
    disable() {
        log(`disabling ${Me.metadata.name}`);

        this._indicator.destroy();
        this._indicator = null;
        this._m_warm_backlight_slider.destroy();
        this._m_warm_backlight_slider = null;
    }

	rotate_screen(){
		log('rotate_screen start');
    	// let state = get_state();
    	// let logical_monitor = state.get_logical_monitor_for(builtin_monitor.connector);
		// log(logical_monitor.transform);
		this.rotate_to("left-up");

	}

	rotate_to(orientation) {
        log('Rotate screen to ' + orientation);
        let target = Orientation[orientation];
        try {
            GLib.spawn_async(
                Me.path,
                ['gjs', `${Me.path}/rotator.js`, `${target}`],
                null,
                GLib.SpawnFlags.SEARCH_PATH,
                null);
        } catch (err) {
            logError(err);
        }
    }
}


function init() {
    log(`initializing ${Me.metadata.name}`);

    return new Extension();
}
