/**
 * Manage cache, saving files locally, etc
 */


// Dependencies
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');

require('dotenv').config({ silent: true });
const debug = require('debug')('catalog-it:s3');


// Default path for cache
var defaultDir = path.join(
  process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'],
  '.catalog-it');

// Cache constructor
var Cache = function(options) {
  options = options || {};
  this.options = options;
  this.base = options.path ? path.resolve(options.path) : defaultDir;
  this.directory = path.join(this.base, options.catalog);
  this.catalogPath = path.join(this.directory, 'catalog.json');

  mkdirp.sync(this.directory);
  this.clearFiles();
}

// Save dataset list
Cache.prototype.setCatalog = function(catalog) {
  debug('Set catalog: ' + this.catalogPath);
  fs.writeFileSync(this.catalogPath, JSON.stringify(catalog));
}

// Load dataset list
Cache.prototype.getCatalog = function() {
  debug('Get catalog: ' + this.catalogPath);
  if (fs.existsSync(this.catalogPath)) {
    return JSON.parse(fs.readFileSync(this.catalogPath));
  }
}

// Remove catalog
Cache.prototype.removeCatalog = function() {
  debug('Remove catalog: ' + this.catalogPath);
  if (fs.existsSync(this.catalogPath)) {
    fs.unlinkSync(this.catalogPath);
  }
}

// Save file
Cache.prototype.setFile = function(filename, contents) {
  fs.writeFileSync(path.join(this.directory, filename), contents);
}

// Read file
Cache.prototype.getFile = function(filename) {
  const file = path.join(this.directory, filename);

  if (fs.existsSync(file)) {
    return fs.writeFileSync(file);
  }
}

// Remove file
Cache.prototype.removeFile = function(filename) {
  const file = path.join(this.directory, filename);

  if (fs.existsSync(file)) {
    return fs.unlinkSync(file);
  }
}

// Remove all files
Cache.prototype.clearFiles = function(filename) {
  debug('Clear files: ' + this.directory);
  const files = fs.readdirSync(this.directory);
  files.forEach(function(f) {
    if (f !== 'catalog.json') {
      fs.unlinkSync(f);
    }
  });
}

// Export
module.exports = Cache;
