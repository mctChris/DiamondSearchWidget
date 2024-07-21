const ejs = require('ejs');

module.exports = function(app) {
    app.set('view engine', 'ejs');
    app.set('views', './app/views');
};
