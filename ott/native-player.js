/* ES5: Samsung AVPlay is optional in hosted/Media Station X contexts. */
(function(root) {
  'use strict';
  var generation = 0, active = false, timer = null, callbacks = null;
  var loading = false, loadCallbacks = [], loadState = 'idle';
  function api() {
    try { return root.webapis && root.webapis.avplay; } catch (e) { return null; }
  }
  function available() {
    var p = api();
    return !!(p && typeof p.open === 'function' && typeof p.prepareAsync === 'function' && typeof p.play === 'function');
  }
  function stop() {
    generation++; active = false; callbacks = null; root.clearTimeout(timer); timer = null;
    var p = api();
    if (p) { try { p.stop(); } catch (e1) {} try { p.close(); } catch (e2) {} }
  }
  function start(url, cb, options) {
    stop();
    if (!available()) { cb.failed(); return; }
    var p = api(), id = generation, ready = false, failed = false;
    active = true; callbacks = cb;
    function fail() {
      if (id !== generation || failed) return;
      failed = true;
      if (ready) { if (cb.error) cb.error(); }
      else { stop(); cb.failed(); }
    }
    function valid() { return id === generation && active && !failed; }
    try {
      p.open(url);
      p.setListener({
        onbufferingstart: function() { if (valid() && cb.buffer) cb.buffer(true); },
        onbufferingcomplete: function() { if (valid() && cb.buffer) cb.buffer(false); },
        onerror: fail,
        onstreamcompleted: function() { if (valid() && cb.ended) cb.ended(); },
        onsubtitlechange: function(duration, text) { if (valid() && cb.subtitle) cb.subtitle(text || '', Number(duration) || 0); }
      });
      // Samsung uses 1920x1080 coordinates even for a 1280x720 app viewport.
      var initialMethod = (options && options.aspectMethod) || (cb && cb.aspectMethod) || 'PLAYER_DISPLAY_MODE_LETTER_BOX';
      p.setDisplayRect(0, 0, 1920, 1080);
      try { p.setDisplayMethod(initialMethod); } catch (ratioError) {}
      timer = root.setTimeout(fail, 20000);
      p.prepareAsync(function() {
        if (!valid()) return;
        root.clearTimeout(timer); timer = null;
        try {
          p.play(); if (!valid()) return; ready = true;
          try { p.setSilentSubtitle(true); } catch (subError) {}
          if (cb.ready) cb.ready();
        } catch (playError) { fail(); }
      }, fail);
    } catch (openError) { fail(); }
  }
  function setDisplayMethod(method) {
    var p = api();
    if (!active || !p) return false;
    try {
      p.setDisplayRect(0, 0, 1920, 1080);
      p.setDisplayMethod(method || 'PLAYER_DISPLAY_MODE_LETTER_BOX');
      return true;
    } catch (e) { return false; }
  }
  function resolution() {
    var p = api();
    if (!active || !p) return null;
    try {
      if (typeof p.getCurrentStreamInfo === 'function') {
        var streams = p.getCurrentStreamInfo();
        if (streams && streams.length) {
          for (var i = 0; i < streams.length; i++) {
            if (streams[i] && streams[i].type === 'VIDEO') {
              var info = streams[i].extra_info;
              if (typeof info === 'string') {
                try { info = JSON.parse(info); } catch (eJson) {}
              }
              if (info) {
                var w = Number(info.Width || info.width || 0);
                var h = Number(info.Height || info.height || 0);
                if (w > 0 && h > 0) return { width: w, height: h };
              }
            }
          }
        }
      }
    } catch (eStream) {}
    try {
      if (typeof p.getTotalTrackInfo === 'function') {
        var all = p.getTotalTrackInfo();
        if (all && all.length) {
          for (var j = 0; j < all.length; j++) {
            if (all[j] && all[j].type === 'VIDEO') {
              var tInfo = all[j].extra_info;
              if (typeof tInfo === 'string') {
                try { tInfo = JSON.parse(tInfo); } catch (eJson2) {}
              }
              if (tInfo) {
                var tw = Number(tInfo.Width || tInfo.width || 0);
                var th = Number(tInfo.Height || tInfo.height || 0);
                if (tw > 0 && th > 0) return { width: tw, height: th };
              }
            }
          }
        }
      }
    } catch (eTrack) {}
    return null;
  }
  function info() {
    var p = api();
    if (!active || !p) return {currentTime:0,duration:0,paused:true};
    try { return { currentTime:p.getCurrentTime()/1000, duration:p.getDuration()/1000, paused:p.getState()==='PAUSED' }; }
    catch (e) { return {currentTime:0,duration:0,paused:false}; }
  }
  function tracks(type) {
    if (!active) return [];
    try {
      var all = api().getTotalTrackInfo(), out = [];
      for (var i=0; i<all.length; i++) if (all[i].type === type) out.push(all[i]);
      return out;
    } catch (e) { return []; }
  }
  function seek(seconds) {
    var value = info();
    if (!active || value.duration <= 0) return false;
    try { api().seekTo(Math.floor(Math.max(0, Math.min(value.duration - 0.1, seconds))*1000)); return true; }
    catch (e) { return false; }
  }
  function toggle() {
    if (!active) return false;
    try { if (api().getState()==='PAUSED') api().play(); else api().pause(); return true; } catch (e) { return false; }
  }
  function select(type, index) {
    if (!active) return false;
    try { api().setSelectTrack(type, Number(index)); return true; } catch (e) { return false; }
  }
  function load(onReady) {
    if (available()) { loadState = 'available'; if (onReady) onReady(); return; }
    if (!/Tizen/i.test((root.navigator && root.navigator.userAgent) || '')) {
      loadState = 'unsupported'; if (onReady) onReady(); return;
    }
    if (onReady) loadCallbacks.push(onReady);
    if (loading) return;
    loading = true; loadState = 'loading';
    var script = null, poll = null, attempts = 0, finished = false;
    function finish() {
      if (finished) return;
      finished = true; root.clearTimeout(poll);
      loading = false; loadState = available() ? 'available' : 'unavailable';
      if (script) {
        script.onload = script.onerror = null;
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      var pending = loadCallbacks; loadCallbacks = [];
      for (var i = 0; i < pending.length; i++) pending[i]();
    }
    function check() {
      if (finished) return;
      if (available() || ++attempts >= 20) { finish(); return; }
      poll = root.setTimeout(check, 250);
    }
    // The host may expose webapis after startup, even if script loading fails.
    // Keep checking for five seconds and allow another attempt on Options entry.
    if (!root.webapis) {
      try {
        script = root.document.createElement('script');
        script.src = '$WEBAPIS/webapis/webapis.js';
        script.onload = function() { if (available()) finish(); };
        script.onerror = function() { if (available()) finish(); };
        root.document.head.appendChild(script);
      } catch (loadError) {}
    }
    if (!finished) check();
  }
  root.TeamGNative = {available:available, active:function(){return active;}, start:start, stop:stop,
    info:info, tracks:tracks, seek:seek, toggle:toggle, select:select, load:load,
    status:function(){return available() ? 'available' : loadState;},
    resolution:resolution, setDisplayMethod:setDisplayMethod};
})(window);
