/* global MozActivity, LazyLoader, Service, SystemBanner */

/**
 * DeviceStorageWatcher listens for nsIDOMDeviceStorage.onchange events
 * notifying about low device storage situations (see Bug 861921). When a
 * 'onchange' event containing a 'low-disk-space' reason is received, we show a
 * banner for a few seconds and pin a notification in the notifications center.
 * When the reason of the 'onchange' event is 'available-disk-space', we remove
 * the pinned notification, if one exists.
 */

'use strict';
(function(exports) {

  var DeviceStorageWatcher = {

    LOW_DISK_NOTIF_ID: 'low-disk-space',

    start: function dsw_init() {
      this._lowDeviceStorage = false;
      this._freeSpace = null;

      this._ = navigator.mozL10n.get;

      this._appStorage = navigator.getDeviceStorage('apps');
      this._appStorage.addEventListener('change', this);

      this._container = document.getElementById('storage-watcher-container');
      this._container.onclick = this.containerClicked;

      this._message = this._container.querySelector('.title-container');
      this._availableSpace = this._container.querySelector('.detail');

      window.addEventListener('appopening', this);
    },

    containerClicked: function dsw_containerClicked() {
      // We redirect the user to the app permissions section of the settings app
      // so she can uninstall 3rd party apps trying to recover from the low
      // storage situation. This is not the best solution, but the only one that
      // we have so far. In the future, we must expose how much storage each app
      // consumes, so the user has a better idea of which apps are consuming
      // more (see Bug 862408).
      /* jshint nonew: false */
      new MozActivity({
        name: 'configure',
        data: {
          section: 'appPermissions'
        }
      });
    },

    hideNotification: function dsw_hideNotification() {
      this._lowDeviceStorage = false;
      if (this._container.classList.contains('displayed')) {
        this._container.classList.remove('displayed');
        Service.request('NotificationScreen:removeUnreadNotification',
          this.LOW_DISK_NOTIF_ID);
      }
    },

    displayNotification: function dsw_displayNotification() {
      this._lowDeviceStorage = true;
      if (!this._container.classList.contains('displayed')) {
        this._container.classList.add('displayed');
        Service.request('NotificationScreen:addUnreadNotification',
          this.LOW_DISK_NOTIF_ID);
      }
    },

    displayBanner: function dsw_displayBanner(space) {
      var notification = ['low-device-storage'];
      if (space && typeof space.size !== 'undefined' && space.unit) {
        notification.push({
          id: 'free-space',
          args: {
            value: space.size,
            unit: space.unit
          }
        });
      } else {
        notification.push('unknown-free-space');
      }
      LazyLoader.load(['js/system_banner.js']).then(() => {
        var systemBanner = new SystemBanner();
        systemBanner.show(notification);
      }).catch((err) => {
        console.error(err);
      });
    },

    lowDiskSpaceNotification: function dsw_lowDiskSpaceNotification(space) {
      this.displayBanner(space);
      this._message.setAttribute('data-l10n-id', 'low-device-storage');
      this.updateAvailableSpace(space);
      this.displayNotification();
    },

    updateAvailableSpace: function dsw_updateAvailableSpace(space) {
      if (space && typeof space.size !== 'undefined' && space.unit) {
        navigator.mozL10n.setAttributes(
          this._availableSpace,
          'free-space',
          {
            value: space.size,
            unit: space.unit
          }
        );
      } else {
        this._availableSpace.setAttribute('data-l10n-id', 'unknown-free-space');
      }
    },

    /**
     * Helper function to format the value returned by the
     * nsIDOMDeviceStorage.freeSpace call in a more readable way.
     */
    formatSize: function dsw_formatSize(size) {
      if (size === undefined || isNaN(size)) {
        return;
      }

      var units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
      var i = 0;
      while (size >= 1024 && i < (units.length) - 1) {
        size /= 1024;
        ++i;
      }

      var sizeDecimal = i < 2 ? Math.round(size) : Math.round(size * 10) / 10;

      return {
        size: sizeDecimal,
        unit: this._('byteUnit-' + units[i])
      };
    },

    handleEvent: function dsw_handleEvent(evt) {
      // Display low storage banner every time an app opens with low storage.
      if (evt.type === 'appopening') {
        if (this._lowDeviceStorage) {
          this.displayBanner(this._freeSpace);
        }
        return;
      }

      // Otherwise if event is not a storage change event we ignore it.
      if (evt.type !== 'change') {
        return;
      }

      switch (evt.reason) {
        // We get 'onchange' events with a 'low-disk-space' reason when a
        // modification of a file is identified while the device is in a low
        // storage situation. When we get the first notification, we have to
        // show a system banner and pin a notification in the notifications
        // center, containing the remaining free space. Consecutive events with
        // a 'low-disk-space' reason will only update the remaining free space.
        case 'low-disk-space':
          var req = this._appStorage.freeSpace();
          req.onsuccess = () => {
            if (typeof req.result !== 'undefined') {
              this._freeSpace = this.formatSize(req.result);
            }
            if (this._lowDeviceStorage) {
              this.updateAvailableSpace(this._freeSpace);
              return;
            }
            this.lowDiskSpaceNotification(this._freeSpace);
          };
          req.onerror = () => {
            this.lowDiskSpaceNotification();
          };
          break;

        case 'available-disk-space':
          this.hideNotification();
          break;
      }
    }
  };

  exports.DeviceStorageWatcher = DeviceStorageWatcher;
}(window));
