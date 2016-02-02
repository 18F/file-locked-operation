/* jshint node: true */
/* jshint expr: true */
/* jshint mocha: true */
'use strict';

var path = require('path');
var fs = require('fs');
var FileLockedOperation = require('../index.js');
var expect = require('chai').expect;
var testHelper = require('./lib/test-helper.js');

var check = testHelper.check;
var checkN = testHelper.checkN;

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

    it('should fail if the lock file cannot be created', function(done) {
      fs.chmod(lockFileDir, '400', function() {
        var restorePermissions = function(err) {
          fs.chmod(lockFileDir, '700', function() { done(err); });
        };

        var checkErrorMsg = check(restorePermissions, function(err) {
          expect(err.message).contains(lockFilePath);
        });

        lock.doLockedOperation(function() { }, checkErrorMsg);
      });
    });

    it('should prevent multiple operations from overlapping', function(done) {
      // We generate Promise objects in order to create a series of
      // interleaved asynchronous operations. The trick is to wrap the
      // generator() calls in function literals passed to Promise.then().
      var ops = [];
      var generator = function(op) {
        return new Promise(function(resolve) { ops.push(op); resolve(); });
      };

      var combinedOps = function(done) {
        // To make this test fail (because the operations are interleaved),
        // then delete/comment out the lock.doLockedOperation() call.
        lock.doLockedOperation(function(done) {
          generator('op1')
            .then(function() { return generator('op2'); })
            .then(function() { return generator('op3'); })
            .then(done, done);
        }, done);
      };

      // checkCallsDoNotOverlap will execute the assertions after all of the
      // Promises have been resolved.
      var checkCallsDoNotOverlap = checkN(3, done, function(errors) {
        expect(errors).to.be.empty;
        expect(ops.slice(0, 3)).to.eql(ops.slice(3, 6));
        expect(ops.slice(3, 6)).to.eql(ops.slice(6, 9));
      });

      combinedOps(checkCallsDoNotOverlap);
      combinedOps(checkCallsDoNotOverlap);
      combinedOps(checkCallsDoNotOverlap);
    });

    it('should abort incoming operations if the lock wait expires',
      function(done) {
      // Set the lock wait to expire right away.
      var lockOpts = {wait: 0, poll: 100};
      lock = new FileLockedOperation(lockFilePath, lockOpts);

      var ops = [];
      var initiateOperation = function(operationDone) {
        lock.doLockedOperation(function(lockedOperationDone) {
          new Promise(function(resolve) { ops.push('doing op'); resolve(); })
            .then(lockedOperationDone, lockedOperationDone);
        }, operationDone);
      };

      var checkOnlyFirstOperationSucceeds = checkN(3, done, function(errors) {
        var expectedError = new Error(
          'FileLockedOperation.doLockedOperation: EEXIST, ' +
          'open \'' + lockFilePath + '\'');
        expect(errors).to.eql([expectedError, expectedError]);
        expect(ops).to.eql(['doing op']);
      });

      initiateOperation(checkOnlyFirstOperationSucceeds);
      initiateOperation(checkOnlyFirstOperationSucceeds);
      initiateOperation(checkOnlyFirstOperationSucceeds);
    });

    it('should release the lock if the operation throws', function(done) {
      var operation;

      operation = function() {
        throw new Error('forced error');
      };
      lock.doLockedOperation(operation, function(err) {
        try {
          expect(err.toString()).contains('forced error');
        } catch (e) {
          return done(e);
        }
        // Now ensure we can still grab the lock and do something.
        lock.doLockedOperation(function() { }, done);
      });
    });
  });
});
