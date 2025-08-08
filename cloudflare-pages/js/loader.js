// TeamG Play Widget Loader for LG NetCast
(function() {
    'use strict';
    
    console.log('TeamG Play Widget Loader initialized');
    
    // Widget configuration
    var config = {
        name: "TeamG Play TV",
        version: "1.0.0",
        platform: "LG NetCast",
        via: "Media Station X"
    };
    
    // Main application URL
    var appUrl = "https://play.teamg.store/netcast/index.html";
    
    // Initialize widget
    function initWidget() {
        console.log('Initializing TeamG Play Widget...');
        
        // Check if we're in MSX environment
        if (typeof MSX !== 'undefined') {
            console.log('MSX environment detected');
            // MSX specific initialization
            MSX.start({
                name: config.name,
                version: config.version,
                parameter: "menu:http://widget.teamg.store/msx/menu.json"
            });
        } else {
            console.log('Direct navigation to TeamG Play');
            // Direct navigation for other environments
            setTimeout(function() {
                window.location.href = appUrl;
            }, 1000);
        }
    }
    
    // Error handler
    function handleError(error) {
        console.error('TeamG Widget Error:', error);
        // Fallback to direct navigation
        window.location.href = appUrl;
    }
    
    // DOM ready check
    function domReady(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback);
        } else {
            callback();
        }
    }
    
    // Initialize when DOM is ready
    domReady(function() {
        try {
            initWidget();
        } catch (error) {
            handleError(error);
        }
    });
    
    // Global error handler
    window.addEventListener('error', handleError);
    
})();
