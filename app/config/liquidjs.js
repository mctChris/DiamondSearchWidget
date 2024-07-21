var { Liquid } = require('liquidjs');

module.exports = function(app) {
  var engine = new Liquid();
  app.engine('liquid', engine.express());
  app.set('views', './app/views');
  app.set('view engine', 'liquid');
};
