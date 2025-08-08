// Edge Function para servir JSON en widget.teamg.store
export const config = { runtime: 'edge' };

export default async function handler(req) {
  try {
    // Fetch del JSON original desde el proyecto principal
    const response = await fetch('https://play.teamg.store/netcast/start.json');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    
    const json = await response.json();
    
    // Devolver JSON con headers correctos
    return new Response(JSON.stringify(json), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    // Fallback JSON en caso de error
    const fallbackJson = {
      "version": "1.0.0",
      "id": "com.teamg.play.netcast",
      "name": "TeamG Play TV",
      "description": "TeamG Play optimizado para LG NetCast vía Media Station X.",
      "icon": "https://play.teamg.store/netcast/TeamG%20Play.png",
      "homepage": "https://play.teamg.store/netcast/index.html",
      "app": {
        "type": "web",
        "title": "TeamG Play TV",
        "url": "https://play.teamg.store/netcast/index.html",
        "icon": "https://play.teamg.store/netcast/TeamG%20Play.png"
      },
      "startup": {
        "url": "https://play.teamg.store/netcast/index.html"
      },
      "meta": {
        "platform": "LG NetCast",
        "via": "Media Station X",
        "maintainer": "TeamG",
        "error": error.message
      }
    };
    
    return new Response(JSON.stringify(fallbackJson), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      }
    });
  }
}
