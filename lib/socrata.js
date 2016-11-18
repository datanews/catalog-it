/**
 * Manage socrate parts.
 */

// Dependencies
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const request = require('request');
const cheerio = require('cheerio');
const moment = require('moment-timezone');

require('dotenv').config({ silent: true });
const debug = require('debug')('catalog-it:socrata');

// Socrata
var Socrata = function(options) {
  options = options || {};
  options.format = options.format || 'csv';
  this.options = options;
  _.bindAll(this, ['getCatalog', 'getHeaders', 'streamResource']);
}

// Get catalog
Socrata.prototype.getCatalog = function(done) {
  if (!this.options.catalog) {
    return done(new Error('No catalog provided to getCatalog.'));
  }

  debug('Fetching catalog: ' + this.options.catalog);
  const url = 'https://' + this.options.catalog + '/browse/embed?limitTo=datasets&utf8=%E2%9C%93&page=1&limit=5000';
  request.get(url, _.bind(function(error, response, body) {
    if (error || response.statusCode >= 300) {
      return done(error || new Error('Response getting catalog was ' + response.statusCode));
    }

    var thisSocrata = this;
    let catalog = {
      modified: moment().unix(),
      catalog: this.options.catalog,
      url: url,
      items: {}
    };
    let $ = cheerio.load(body);
    $('table.gridList tr.item').each(function() {
      let item = {};
      let $item = $(this);
      let $link = $item.find('td.richSection a.nameLink');

      item.id = $item.attr('data-viewid');
      item.link = $link.attr('href');
      item.name = $link.text().trim();
      item.identifier = thisSocrata.identifier(item.name);
      item.file = item.id + '-' + item.identifier + '.' + thisSocrata.options.format;
      catalog.items[item.id] = item;
    });

    debug('Fetched catalog: ' + this.options.catalog);
    done(null, catalog);
  }, this));
}

// Get headers for a resource.
// API does not support the HEAD method, so we stream the response, but
// not sure if the response actually gets sense before the whole body does.
Socrata.prototype.getHeaders = function(id, done) {
  debug('Fetching headers: ' + id);
  const url = 'https://' + this.options.catalog + '/resource/' + id + '.json?$limit=1';
  let r = request.get(url);
  r.on('response', _.bind(function(r) {
    if (r.statusCode >= 300) {
      return done(new Error('Response getting catalog was ' + r.statusCode));
    }

    debug('Fetched headers: ' + id);
    done(null, {
      id: id,
      headers: r.headers
    });

    // TODO: Stop stream here.  .abort or .end does not seem to work.
    //r.abort();
  }, this));
  r.on('error', function(error) {
    done(new Error('Error getting url: ' + url + ' | ' + error));
  });
}

// Get resource stream
Socrata.prototype.streamResource = function(id) {
  const url = 'https://' + this.options.catalog + '/resource/' + id + '.' + this.options.format;
  var r = request.get(url);
  r.pause();
  r.__id = id;
  return r;
}

// Make descriptive id
Socrata.prototype.identifier = function(title) {
  return title.toString().toLowerCase().replace(/\W+/g, ' ').trim().replace(/\s+/g, '-');
}


// Export
module.exports = Socrata;