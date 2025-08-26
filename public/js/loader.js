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

    // Main application URL is now relative, as it's served by this same server.
    // The server will serve the actual index.html from the public root.
    var appUrl = "/index.html";

    // This function is now simplified as we are self-contained.
    // The primary purpose of this script, when loaded by the root index.html,
    // is just to confirm that the environment is set up.
    // In a real application, this would contain the core logic.
    function initWidget() {
        console.log('Initializing TeamG Play Widget...');

        // In a real app, you would have your main application logic here.
        // For now, we just log that it's working.
        console.log('Widget logic would run here.');

        // If this loader is part of a more complex flow, you might
        // still want to redirect. But since the JSON points to index.html
        // which loads this script, we are already where we need to be.
        // The following line is commented out as it would cause a loop.
        // window.location.href = appUrl;
    }

    // Error handler
    function handleError(error) {
        console.error('TeamG Widget Error:', error);
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
