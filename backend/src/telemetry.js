// Must be required FIRST in index.js so Application Insights can instrument everything else.
const { log } = require('./log');
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  require('applicationinsights').setup().start();
  log('info', 'Application Insights enabled');
}
