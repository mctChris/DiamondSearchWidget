const helmet = require("helmet");

module.exports = function(app) {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"], 
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                imgSrc: ["'self'", 'data:'],
                connectSrc: ["'self'"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                objectSrc: ["'self'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'self'",]
            },
            reportOnly: true
        },
        frameguard: false
    }));

    app.disable("x-powered-by");
};
