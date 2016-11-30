/**
 * Main class to for high level functions.
 */

// Dependencies
const _ = require('lodash');
const as = require('async');
const moment = require('moment-timezone');
const camelcase = require('camelcase');
const Socrata = require('./socrata.js');
const S3 = require('./s3.js');
const Cache = require('./cache.js');

require('dotenv').config({ silent: true });
const debug = require('debug')('catalog-it:core');


// Catalog class
var CatalogIt = function(options) {
  options = options || {};
  options = this.optionsFromEnvironment(options);
  options = this.castOptions(options);

  // Defaults
  options.acl = options.acl || 'private';
  options.concurrency = options.concurrency || 5;
  options.format = options.format || 'csv';
  this.options = options;
  _.bindAll(this, ['updateCatalog', 'updateHeaders', 'fetchHeaders', 'scanHeaders', 'fetchData', 'scanData']);

  // TODO: Option to set timezone moment.tz.setDefault('America/New_York');

  // Make parts
  this.socrata = new Socrata(options);
  this.s3 = new S3(options);
  this.cache = new Cache(options);
  this.catalog = this.cache.getCatalog();
}

// Options from environment variables.  Environment variables will not
// override the values passed
CatalogIt.prototype.optionsFromEnvironment = function(options) {
  // Ignore path as its a more general environment variable
  var props = ['catalog', 'bucket', 'acl', 'concurrency', 'format', 'prefix', 'timeout', 'profile', 'noBucketCreate'];

  _.each(process.env, function(v, p) {
    if (p.toLowerCase().indexOf('catalog_it_') === 0) {
      var o = camelcase(p.toLowerCase().replace('catalog_it_', ''));
      if (~props.indexOf(o) && !options[o]) {
        options[o] = v;
      }
    }
  });

  return options;
}

// Cast options
CatalogIt.prototype.castOptions = function(options) {
  _.each(['concurrency', 'timeout'], function(p) {
    options[p] = (!options[p] || _.isNaN(parseInt(options[p], 10))) ? undefined : parseInt(options[p], 10);
  });
  _.each(['noBucketCreate'], function(p) {
    options[p] = (!options[p]) ? false : true;
  });

  return options;
}

// Update catalog
CatalogIt.prototype.updateCatalog = function(done) {
  this.socrata.getCatalog(_.bind(function(error, catalog) {
    if (error && _.isFunction(done)) {
      return done(error);
    }
    else if (error) {
      throw new Error(error);
    }

    // Combine old catalog with new
    if (this.catalog) {
      catalog = _.defaultsDeep(catalog, this.catalog);
    }

    this.catalog = catalog;
    this.cache.setCatalog(this.catalog);

    if (_.isFunction(done)) {
      done(null, catalog);
    }
  }, this));
}

// Update an item given headers
CatalogIt.prototype.updateHeaders = function(id, headers, done) {
  var item = this.catalog.items[id];
  item.headerCheck = moment().unix();
  item.headers = headers;

  // See if need to update
  var last = moment(new Date(headers['last-modified'])).unix();
  // If never gotten headers, or never saved, or has been modified
  if (!item.lastModified || !item.lastSaved || item.lastModified !== last) {
    item.update = true;
  }
  else {
    item.update = false;
  }
  item.lastModified = last;

  this.cache.setCatalog(this.catalog);
  if (_.isFunction(done)) {
    done(null, item);
  }
}

// Fetch headers for an item
CatalogIt.prototype.fetchHeaders = function(id, done) {
  this.socrata.getHeaders(id, _.bind(function(error, headers) {
    if (error && _.isFunction(done)) {
      return done(error);
    }
    else if (error) {
      throw new Error(error);
    }

    this.updateHeaders(id, headers.headers, done);
  }, this));
}

// Scan all headers
CatalogIt.prototype.scanHeaders = function(done) {
  var queue = [];

  // Queue up header fetching.
  _.each(this.catalog.items, _.bind(function(i) {
    queue.push(as.apply(this.fetchHeaders, i.id));
  }, this));

  // Start,
  as.parallelLimit(as.reflectAll(queue), this.options.concurrency, function(error, results) {
    var errors = _.filter(results, 'error').length;
    var updated = results.length - errors;

    done(errors ? _.filter(results, 'error') : null, {
      errors: errors,
      updated: updated
    });
  });
}

// Fetch dataset
CatalogIt.prototype.fetchData = function(id, done) {
  var item = this.catalog.items[id];
  var timeFormat = moment().format();
  var name = item.id + '-' + item.identifier + '/' + timeFormat + '__' + item.id + '.' + this.options.format;
  var input = this.socrata.streamResource(id);

  this.s3.upload(name, input, _.bind(function(error, results) {
    if (error && _.isFunction(done)) {
      return done(error);
    }
    else if (error) {
      throw new Error(error);
    }

    // Update catalog
    item.update = false;
    item.lastSaved = moment().unix();
    this.cache.setCatalog(this.catalog);
    if (_.isFunction(done)) {
      done(null, item);
    }
  }, this));
}

// Scan all data
CatalogIt.prototype.scanData = function(done) {
  var queue = [];

  // Queue up data fetching.
  _.each(this.catalog.items, _.bind(function(i) {
    if (i.update) {
      queue.push(as.apply(this.fetchData, i.id));
    }
  }, this));

  // Start,
  as.parallelLimit(as.reflectAll(queue), this.options.concurrency, function(error, results) {
    var errors = _.filter(results, 'error').length;
    var updated = results.length - errors;

    done(errors ? _.filter(results, 'error') : null, {
      errors: errors,
      updated: updated
    });
  });
}



// Exports
module.exports = CatalogIt;
