/**
 * Main class to for high level functions.
 */

// Dependencies
const _ = require('lodash');
const as = require('async');
const moment = require('moment-timezone');
const Socrata = require('./socrata.js');
const S3 = require('./s3.js');
const Cache = require('./cache.js');

require('dotenv').config({ silent: true });
const debug = require('debug')('catalog-it:core');


// Catalog class
var CatalogIt = function(options) {
  options = options || {};
  options.acl = options.acl || 'private';
  options.concurrency = options.concurrency || 5;
  options.format = options.format || 'csv';
  this.options = options;

  // Make parts
  this.socrata = new Socrata(options);
  this.s3 = new S3(options);
  this.cache = new Cache(options);
  this.catalog = cache.getCatalog();
}

// Update catalog
CatalogIt.prototype.updateCatalog(done) {
  this.socrata.getCatalog(function(error, catalog) {
    if (error && _.isFunction(done)) {
      return done(error);
    }
    else if (error) {
      throw new Error(error);
    }

    // Combine old catalog with new
    if (this.catalog) {
      catalog = _.defaultsDeep(this.catalog, catalog);
    }

    this.catalog = catalog;
    cache.setCatalog(this.catalog);

    if (_.isFunction(done)) {
      done(null, catalog);
    }
  });
}

// Update an item given headers
CatalogIt.prototype.updateHeaders(id, headers, done) {
  var item = this.catalog.items[id];
  item.headerCheck = moment().unix();
  item.headers = headers;

  // See if need to update
  var last = moment(new Date(headers['last-modified'])).unix();
  if (!item.lastModified || item.lastModified !== last) {
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
CatalogIt.prototype.fetchHeaders(id, done) {
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
CatalogIt.prototype.scanHeaders(done) {
  var queue = [];

  // Queue up header fetching.
  _.each(this.catalog.items, _.bind(function(i) {
    queue.push(async.apply(this.fetchHeaders, i.id));
  }, this));

  // Start,
  async.parallelLimit(async.reflectAll(queue), this.options.concurrency, function(error, results) {
    var errors = _.filter(results, 'error');
    var updated = results.length - errors;

    done(errors ? _.filter(results, 'error') : null, {
      errors: errors,
      updated: updated
    });
  });
}

// Fetch dataset
CatalogIt.prototype.fetchData(id, done) {
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
CatalogIt.prototype.scanData(done) {
  var queue = [];

  // Queue up data fetching.
  _.each(this.catalog.items, _.bind(function(i) {
    queue.push(async.apply(this.fetchData, i.id));
  }, this));

  // Start,
  async.parallelLimit(async.reflectAll(queue), this.options.concurrency, function(error, results) {
    var errors = _.filter(results, 'error');
    var updated = results.length - errors;

    done(errors ? _.filter(results, 'error') : null, {
      errors: errors,
      updated: updated
    });
  });
}



// Exports
module.exports = CatalogIt;
