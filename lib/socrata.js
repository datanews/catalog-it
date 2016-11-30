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
const devnull = require('dev-null');

require('dotenv').config({ silent: true });
const debug = require('debug')('catalog-it:socrata');

// Socrata
var Socrata = function(options) {
  options = options || {};
  options.format = options.format || 'csv';
  this.options = options;
  _.bindAll(this, ['getCatalog', 'getHeaders', 'streamResource', 'parseListTable', 'parseListDiv']);
}

// Get catalog
Socrata.prototype.getCatalog = function(done) {
  if (!this.options.catalog) {
    return done(new Error('No catalog provided to getCatalog.'));
  }
  debug('Fetching catalog: ' + this.options.catalog);

  // Catalog object
  let catalog = {
    modified: moment().unix(),
    catalog: this.options.catalog,
    urls: [],
    items: {}
  };
  let page = 1;
  let thisSocrata = this;

  // Get catalog page
  function getCatalogPage() {
    const url = 'https://' + this.options.catalog + '/browse/embed?limitTo=datasets&utf8=%E2%9C%93&page=' + page + '&limit=1000';
    debug('Fetching: ' + url);

    request.get(url, _.bind(function(error, response, body) {
      if (error || response.statusCode >= 300) {
        return done(error || new Error('Response getting catalog was ' + response.statusCode));
      }

      let $ = cheerio.load(body);
      let tables = $('table.gridList tr.item');
      let divs = $('.browse2-result');

      // If there are items then save and keep going
      if (tables.length || divs.length) {
        if (tables.length) {
          this.parseListTable($, tables, catalog);
        }
        else if (divs.length) {
          this.parseListDiv($, divs, catalog);
        }

        page++;
        getCatalogPage();
      }
      else {
        done(null, catalog);
      }
    }, this));
  }
  getCatalogPage = _.bind(getCatalogPage, this);

  // Start on first page
  getCatalogPage();
}

// Parse table list
Socrata.prototype.parseListTable = function($, items, catalog) {
  var thisSocrata = this;

  items.each(function() {
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

  return catalog;
}

// Parse DIV list
Socrata.prototype.parseListDiv = function($, items, catalog) {
  var thisSocrata = this;

  items.each(function() {
    let item = {};
    let $item = $(this);
    let $link = $item.find('a.browse2-result-name-link');

    item.id = $item.attr('data-view-id');
    item.link = $link.attr('href');
    item.name = $link.text().trim();
    item.identifier = thisSocrata.identifier(item.name);
    item.file = item.id + '-' + item.identifier + '.' + thisSocrata.options.format;
    catalog.items[item.id] = item;
  });

  return catalog;
}


// Get headers for a resource.
// API does not support the HEAD method, so we stream the response, but
// not sure if the response actually gets sense before the whole body does.
Socrata.prototype.getHeaders = function(id, done) {
  debug('Fetching headers: ' + id);
  const url = 'https://' + this.options.catalog + '/resource/' + id + '.json?$limit=1';
  let r = request({
    method: 'GET',
    timeout: this.options.timeout || 120000,
    url: url
  });
  r.on('response', function(r) {
    if (r.statusCode >= 300) {
      return done(new Error('Response getting catalog was ' + r.statusCode));
    }

    debug('Fetched headers: ' + id);
    done(null, {
      id: id,
      headers: r.headers
    });
    this.abort();
  });
  r.on('error', function(error) {
    done(new Error('Error getting url: ' + url + ' | ' + error));
  });
  r.pipe(devnull());
}

// Get resource stream
Socrata.prototype.streamResource = function(id) {
  // API limits to 1000 rows
  // const url = 'https://' + this.options.catalog + '/resource/' + id + '.' + this.options.format;
  const url = 'https://' + this.options.catalog + '/api/views/' + id + '/rows.csv?accessType=DOWNLOAD';
  var r = request.get({
    method: 'GET',
    timeout: this.options.timeout || 120000,
    url: url
  });
  r.pause();
  r.__id = id;
  r.__url = url;
  return r;
}

// Make descriptive id
Socrata.prototype.identifier = function(title) {
  return title.toString().toLowerCase().replace(/\W+/g, ' ').trim().replace(/\s+/g, '-');
}


// Export
module.exports = Socrata;
