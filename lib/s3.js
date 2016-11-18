/**
 * Manage s3 parts
 */


// Dependencies
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const AWS = require('aws-sdk');
const awsConfig = require('aws-config');
const zlib = require('zlib');
const s3Stream = require('s3-upload-stream');

require('dotenv').config({ silent: true });
const debug = require('debug')('catalog-it:s3');


// S3
// ACL: 'private | public-read | public-read-write | authenticated-read',
var S3 = function(options, done) {
  done = done || _.noop;
  options = options || {};
  options.acl = options.acl || 'private';
  options.prefix = options.prefix + '/' || '';
  options.concurrency = options.concurrency || 5;

  this.options = options;
  _.bindAll(this, ['getAWSConfig', 'createBucket', 'upload']);
  this.awsConfig = this.getAWSConfig(options);

  AWS.config.httpOptions = { timeout: options.timeout || 8000 };

  this.s3 = new AWS.S3(this.awsConfig);
  this.s3Stream = s3Stream(this.s3);
  this.createBucket(done);
}

// Figure out credentials
S3.prototype.getAWSConfig = function(options) {
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
    ACL: this.options.acl
  }, function(error, bucket) {
    if (!_.isFunction(done)) {
      throw new Error(error);
    }

    debug('Created bucket: ' + this.options.bucket);
    done(error, bucket);
  });
}

// Upload
S3.prototype.upload = function(path, input, done) {
  var key = this.options.prefix + this.options.catalog + '/' + path;
  var upload = this.s3Stream.upload({
    Bucket: this.options.bucket,
    Key: key
  });
  debug('Uploading: ' + key);

  // Handle input stream errors
  input.on('error', function(error) {
    done(new Error('Error getting id: ' + input.__id + ' | ' + error));
  });

  // Setup s3 stream
  upload.concurrentParts(this.options.concurrency);
  upload.on('error', done);
  //upload.on('part', function (details) { });
  upload.on('uploaded', _.bind(function(details) {
    debug('Uploaded: ' + key);
    done(null, details);
  }, this));

  // Go
  input.pipe(upload);
  input.resume();
}

// Export
module.exports = S3;
