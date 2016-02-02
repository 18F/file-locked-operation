'use strict';

var FileLockedOperation = require('../index.js');
var path = require('path');
var fs = require('fs');
var temp = require('temp');
var scriptName = require('../package.json').name;
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');

chai.should();
chai.use(chaiAsPromised);

describe('FileLockedOperation', function() {
  describe('doLockedOperation', function() {
    var lockFileDir, lockFilePath, lock;

    before(function(done) {
      temp.mkdir(scriptName + '-test-files-', function(err, tempDir) {
        if (err) {
          return done(err);
        }
        lockFileDir = tempDir;
        lockFilePath = path.resolve(lockFileDir, '.test-lock');
        lock = new FileLockedOperation(lockFilePath);
        done();
      });
    });

    after(function(done) {
      fs.rmdir(lockFileDir, done);
    });

    it('should fail if the lock file cannot be created', function() {
      var changePermissions,
          restorePermissions;

      changePermissions = function() {
        return new Promise(function(resolve, reject) {
          fs.chmod(lockFileDir, '400', function(err) {
            if (err) {
              return reject(err);
            }
            resolve();
          });
        });
      };

      restorePermissions = function(operationError) {
        return new Promise(function(resolve, reject) {
          fs.chmod(lockFileDir, '700', function(err) {
            if (err) {
              return reject(err);
            }
            operationError ? reject(operationError) : resolve();
          });
        });
      };

      return changePermissions()
        .then(function() {
          return lock.doLockedOperation(function() { });
        })
        .then(restorePermissions, restorePermissions)
        .should.be.rejectedWith(Error, lockFilePath);
    });

    it('should prevent multiple operations from overlapping', function(done) {
      // We generate Promise objects in order to create a series of
      // interleaved asynchronous operations. The trick is to wrap the
      // generator() calls in function literals passed to Promise.then().
      var ops = [],
          generator,
          combinedOps;

      generator = function(op) {
        return new Promise(function(resolve) {
          ops.push(op);
          resolve();
        });
      };

      combinedOps = function() {
        // To make this test fail (because the operations are interleaved),
        // delete/comment out the lock.doLockedOperation() call.
        return lock.doLockedOperation(function() {
          generator('op1')
            .then(function() { return generator('op2'); })
            .then(function() { return generator('op3'); });
        });
      };

      Promise.all([combinedOps(), combinedOps(), combinedOps()])
        .should.be.fulfilled.then(function() {
          ops.slice(0, 3).should.eql(ops.slice(3, 6));
          ops.slice(3, 6).should.eql(ops.slice(6, 9));
        })
        .should.notify(done);
    });

    it('should abort incoming operations if the lock wait expires', function() {
      var localLock = new FileLockedOperation(lockFilePath),
          initiateOperation,
          results = [];

      initiateOperation = function() {
        // To make this test fail (because the operations try to grab the lock
        // right away), delete/comment out the lock.doLockedOperation() call.
        return localLock.doLockedOperation(function() {
          return Promise.resolve('doing op');
        });
      };

      // The first operation will wait for the lock, in case cleanup from
      // previous tests hasn't completed. (Don't know why this isn't
      // guaranteed by the fixture, but oh well.)
      results.push(initiateOperation());

      // Now set the lock wait to expire right away.
      localLock.opts = {wait: 0, poll: 100};
      results.push(initiateOperation());
      results.push(initiateOperation());

      return Promise.all([
        results[0].should.become('doing op'),
        results[1].should.be.rejectedWith(lockFilePath),
        results[2].should.be.rejectedWith(lockFilePath)
      ]);
    });

    it('should release the lock if the operation throws', function() {
      return lock.doLockedOperation(
        function() {
          throw new Error('forced error');
        })
        .should.be.rejectedWith(Error, 'forced error')
        .then(function() {
          // Now ensure we can still grab the lock and do something.
          return lock.doLockedOperation(function() { });
        })
        .should.be.fulfilled;
    });
  });
});
