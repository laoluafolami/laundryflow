// Structured (JSON) logging: one line = one event. Azure Monitor can query these fields.
function log(level, msg, extra = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...extra }));
}
module.exports = { log };
