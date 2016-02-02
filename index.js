/* jshint node: true */
'use strict';

var lockfile = require('lockfile');

module.exports = FileLockedOperation;

function FileLockedOperation(lockFilePath, lockOpts) {
  this.lockFilePath = lockFilePath;
  this.opts = lockOpts || {wait: 1000, poll: 100};
}

FileLockedOperation.prototype.doLockedOperation = function(operation, done) {
  var lockedOp = this;

  return new Promise(function(resolve, reject) {
      lockfile.lock(lockedOp.lockFilePath, lockedOp.opts, function(err) {
        if (err) {
          return reject(new Error('FileLockedOperation.doLockedOperation: ' +
            err.message));
        }
        lockedOp.lockSet = true;
        resolve();
      });
    })
    .then(function() {
      return new Promise(function(resolve, reject) {
        try {
          return resolve(operation());
        } catch (operationError) {
          return reject(operationError);
        }
      });
    })
    .then(function(result) {
      return releaseLock(null, lockedOp, result);
    })
    .catch(function(err) {
      return releaseLock(err, lockedOp);
    })
    .then(done, done);
};

function releaseLock(opError, lockedOp, result) {
  return new Promise(function(resolve, reject) {
    if (!lockedOp.lockSet) {
      return opError ? reject(opError) : resolve(result);
    }
    lockfile.unlock(lockedOp.lockFilePath, function(err) {
      if (err) {
        return reject(new Error('FileLockedOperation._releaseLock: ' +
          err.message));
      }
      delete lockedOp.lockSet;
      return opError ? reject(opError) : resolve(result);
    });
  });
}
