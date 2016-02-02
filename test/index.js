'use strict';

var FileLockedOperation = require('../index.js');
var path = require('path');
var fs = require('fs');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');

chai.should();
chai.use(chaiAsPromised);

describe('FileLockedOperation', function() {
  describe('doLockedOperation', function() {
    var lockFileDir, lockFilePath, lock;

    before(function() {
      lockFileDir = path.resolve(__dirname, 'lock_file_test');
      lockFilePath = path.resolve(lockFileDir, '.test-lock');
      lock = new FileLockedOperation(lockFilePath);
    });

    beforeEach(function(done) {
      fs.exists(lockFileDir, function(exists) {
        (exists ? fs.chmod : fs.mkdir)(lockFileDir, '0700', done);
      });
    });

    afterEach(function(done) {
      fs.exists(lockFilePath, function(exists) {
        if (exists) { fs.unlink(lockFilePath, done); } else { done(); }
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
      // Set the lock wait to expire right away.
      var lockOpts = {wait: 0, poll: 100},
          initiateOperation,
          results = [];

      lock = new FileLockedOperation(lockFilePath, lockOpts);

      initiateOperation = function() {
        // To make this test fail (because the operations try to grab the lock
        // right away), delete/comment out the lock.doLockedOperation() call.
        return lock.doLockedOperation(function() {
          return Promise.resolve('doing op');
        });
      };

      results.push(initiateOperation());
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
