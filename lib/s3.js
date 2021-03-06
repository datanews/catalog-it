/**
 * Manage s3 parts
 */


// Dependencies
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const stream = require('stream');
const _ = require('lodash');
const filesize = require('filesize');
const AWS = require('aws-sdk');
const awsConfig = require('aws-config');

require('dotenv').config({ silent: true });
const debug = require('debug')('catalog-it:s3');


// S3
// ACL: 'private | public-read | public-read-write | authenticated-read',
var S3 = function(options, done) {
  done = done || _.noop;
  options = options || {};
  options.acl = options.acl || 'private';
  options.prefix = options.prefix ? options.prefix + '/' : '';
  options.concurrency = options.concurrency || 5;
  options.compress = options.compress === false ? false : true;
  options.createBucket = options.createBucket === false ? false : true;

  this.options = options;
  _.bindAll(this, ['getAWSConfig', 'createBucket', 'upload']);

  // AWS set up
  this.awsConfig = this.getAWSConfig(options);
  AWS.config = this.awsConfig;

  // S3 object
  this.s3 = new AWS.S3({
    Bucket: this.options.bucket,
    httpOptions: {
      timeout : options.timeout || 120000
    }
  });

  // Create bucket, also a sort-of good way to test if credentials work.
  if (options.createBucket) {
    this.createBucket(done);
  }
  else  if (_.isFunction(done)) {
    done(null);
  }
}

// Figure out credentials
S3.prototype.getAWSConfig = function(options) {
  // TODO: Set timeout param
  if (options.profile) {
    return awsConfig({ profile: options.profile });
  }
  else if (options.accessKeyId && options.secretAccessKey) {
    return awsConfig({
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey
    });
  }
  else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return awsConfig({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    });
  }
}

// Create bucket
S3.prototype.createBucket = function(done) {
  if (!this.options.bucket) {
    return done(new Error('No bucket provided to createBucket.'));
  }

  this.s3.createBucket({
    Bucket: this.options.bucket,
    //ACL: this.options.acl
  }, _.bind(function(error, bucket) {
    if (!_.isFunction(done)) {
      throw new Error(error);
    }

    if (error) {
      debug('Error creating bucket: ' + this.options.bucket);
    }
    else {
      debug('Created bucket: ' + this.options.bucket);
    }
    done(error, bucket);
  }, this));
}

// Upload
S3.prototype.upload = function(path, input, done) {
  var key = this.options.prefix + this.options.catalog + '/' + path +
    (this.options.compress ? '.gz' : '');
  var pass = new stream.PassThrough();
  var uploadParams = {
    Key: key,
    ACL: this.options.acl,
    Body: this.options.compress ? input.pipe(zlib.createGzip()) : input.pipe(pass)
  };
  var uploadOptions = {
    //queueSize: 2,
    //partSize: 1024 * 1024 * 5
  };
  debug('Uploading: ' + key);

  // Handle input stream errors
  input.on('error', function(error) {
    done(new Error('Error getting id: ' + input.__id + ' | ' + error));
  });

  // Setup s3 upload
  var s3Upload = new AWS.S3({ params: {
    Bucket: this.options.bucket
  }});

  s3Upload.upload(uploadParams, uploadOptions)
    .on('httpUploadProgress', function(e) {
      debug('[' + input.__id + '] Progress (' + e.part + ') ' + filesize(e.loaded));
    })
    .send(function(error, result) {
      if (error) {
        debug('Error: ' + path + ' | ' + JSON.stringify(error));
      }
      else {
        debug('Uploaded: ' + key);
      }

      done(error, result);
    });

  // Start input stream up
  input.resume();
}

// Export
module.exports = S3;
