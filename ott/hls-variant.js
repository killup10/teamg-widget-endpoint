/* ES5: legacy TV decoders can freeze when HLS changes video resolution. */
(function(root) {
  'use strict';
  function choose(text, base) {
    var lines = String(text || '').split(/\r?\n/), best = null, pending = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/^\s+|\s+$/g, '');
      if (line.indexOf('#EXT-X-STREAM-INF:') === 0) {
        var size = line.match(/RESOLUTION=(\d+)x(\d+)/i);
        var rate = line.match(/(?:[:,])BANDWIDTH=(\d+)/i);
        // A rendition with external audio must keep its master playlist.
        pending = size && !/(?:[:,])AUDIO=/i.test(line) &&
          (!/CODECS=/i.test(line) || /avc1\./i.test(line)) &&
          Number(size[1]) <= 1920 && Number(size[2]) <= 1080
          ? {width:Number(size[1]), height:Number(size[2]), rate:rate ? Number(rate[1]) : 0} : null;
      } else if (line && line.charAt(0) !== '#') {
        if (pending && (!best || pending.height > best.height ||
          (pending.height === best.height && pending.rate > best.rate))) {
          pending.uri = line;
          best = pending;
        }
        pending = null;
      }
    }
    if (!best) return null;
    var anchor = root.document.createElement('a');
    if (/^https?:\/\//i.test(best.uri)) anchor.href = best.uri;
    else if (best.uri.indexOf('//') === 0) anchor.href = base.split(':')[0] + ':' + best.uri;
    else if (best.uri.charAt(0) === '/') anchor.href = base.match(/^https?:\/\/[^/]+/i)[0] + best.uri;
    else anchor.href = base.split(/[?#]/)[0].replace(/[^/]*$/, '') + best.uri;
    if (!/^https?:\/\//i.test(anchor.href)) return null;
    best.url = anchor.href;
    return best;
  }
  function resolve(url, callback, requestUrl) {
    var request = new root.XMLHttpRequest(), done = false, timer = null;
    function finish(variant, failed) {
      if (done) return;
      done = true;
      root.clearTimeout(timer);
      callback(variant, !!failed);
    }
    request.onreadystatechange = function() {
      if (request.readyState !== 4 || done) return;
      var variant = null;
      try { if (request.status >= 200 && request.status < 300) variant = choose(request.responseText, requestUrl ? url : (request.responseURL || url)); } catch (e) {}
      finish(variant, request.status < 200 || request.status >= 300 || !/^\s*#EXTM3U/.test(request.responseText || ''));
    };
    request.onerror = function() { finish(null, true); };
    timer = root.setTimeout(function() { finish(null, true); try { request.abort(); } catch (e) {} }, 8000);
    try { request.open('GET', requestUrl || url, true); request.send(); } catch (e) { finish(null, true); }
    return function() { done = true; root.clearTimeout(timer); try { request.abort(); } catch (e) {} };
  }
  root.TeamGHlsVariant = {choose:choose, resolve:resolve};
})(window);
