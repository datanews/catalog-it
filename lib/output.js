/**
 * Functions for output or logging.
 */

// Exports
module.exports = function(options) {
  var output = function() {
    var args = Array.prototype.slice.call(arguments);
    console.log(args.join('\n'));
  }

  output.error = function() {
    var args = Array.prototype.slice.call(arguments);
    console.error(args.join('\n'));
  }

  return output;
};
