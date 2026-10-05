/* ES5: Samsung AVPlay is optional in hosted/Media Station X contexts. */
(function(root) {
  'use strict';
  var generation = 0, active = false, timer = null, callbacks = null;
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
  function start(url, cb) {
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
      p.setDisplayRect(0, 0, 1920, 1080);
      try { p.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (ratioError) {}
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
    try { api().setSelectTrack(type, index); return true; } catch (e) { return false; }
  }
  function load(onReady) {
    if (available()) { onReady(); return; }
    if (!/Tizen/i.test((root.navigator && root.navigator.userAgent) || '')) return;
    var script = root.document.createElement('script');
    script.src = '$WEBAPIS/webapis/webapis.js';
    script.onload = function() { onReady(); };
    script.onerror = function() {};
    root.document.head.appendChild(script);
  }
  root.TeamGNative = {available:available, active:function(){return active;}, start:start, stop:stop,
    info:info, tracks:tracks, seek:seek, toggle:toggle, select:select, load:load};
})(window);
