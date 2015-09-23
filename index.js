/* jshint node: true */
'use strict';

var lockfile = require('lockfile');
var exports = module.exports = {};

function FileLockedOperation(lockFilePath, lockOpts) {
  this.lockFilePath = lockFilePath;
  this.opts = lockOpts || {wait: 1000, poll: 100};
}

FileLockedOperation.prototype.doLockedOperation = function(operation, done) {
  var that = this;
  lockfile.lock(this.lockFilePath, this.opts, function(err) {
    if (err !== undefined) {
      return done(new Error('FileLockedOperation.doLockedOperation: ' +
        err.message));
    }
    operation(function(opError) { that._releaseLock(opError, done); });
  });
};

FileLockedOperation.prototype._releaseLock = function(operationError, done) {
  lockfile.unlock(this.lockFilePath, function(err) {
    if (err !== undefined) {
      var opErrorMsg = (operationError !== undefined) ?
        operationError.message + '\n' : '';
      return done(new Error(opErrorMsg + 'FileLockedOperation._releaseLock: ' +
        err.message));
    }
    done(operationError);
  });
};

exports.FileLockedOperation = FileLockedOperation;
