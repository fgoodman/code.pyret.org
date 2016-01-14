define(["q", "js/secure-loader", "js/runtime-util"], function(q, loader, util) {
  function makeLocatorConstructors(storageAPI, runtime, compileLib, compileStructs) {
    var gf = runtime.getField;
    var gmf = function(m, f) { return gf(gf(m, "values"), f); };
    function fileRequestFailure(failure, filename) {
      var message = "";
      var defaultMessage = "There was an error fetching file with name " + filename + 
            " (labelled " + filename + ") from Google Drive.";
      if(failure.message === "Authentication failure") {
        message = "Couldn't access the file named " + filename +
          " on Google Drive due to an " +
          "authentication failure.  my-gdrive imports require that you are "
          + "connected to Google Drive.";
      }
      else if(failure.err) {
        if(failure.err.code === 404) {
          message = "Couldn't find the file named " + filename +
            " on Google Drive.";
        }
        else if(failure.err.message) {
          message = "There was an error fetching file named " + filename + 
            " from Google Drive: " + failure.err.message;
        }
        else {
          message = defaultMessage;
        }
      }
      else {
        message = defaultMessage;
      }
      return message;
    }
    function makeMyGDriveLocator(filename, id) {
      function checkFileResponse(files, restarter) {
        if(files.length === 0) {
          restarter.error(runtime.ffi.makeMessageException("Could not find module with name " + filename + " in your drive."));
        }
        if(files.length > 1) {
          restarter.error(runtime.ffi.makeMessageException("There were multiple files with name " + filename + " in your drive."));
        }
      }
      function contentRequestFailure(failure) {
        return "Could not load file with name " + filename;
      }

      // Pause because we'll fetch the Google Drive file object and restart
      // with it to create the actual locator
      runtime.pauseStack(function(restarter) {
        // We start by setting up the fetch of the file; lots of methods will
        // close over this.
        var filesP = storageAPI.then(function(storage) {
          if (id !== undefined) {
            // Used for CPO/grade import hijacking.
            return [storage.api.getFileById(id)];
          }
          else {
            return storage.api.getFileByName(filename);
          }
        });
        filesP.fail(function(failure) {
          restarter.error(runtime.ffi.makeMessageException(fileRequestFailure(failure, filename)));
        });
        var fileP = filesP.then(function(files) {
          checkFileResponse(files, restarter);
          // checkFileResponse throws if there's an error
          return files[0];
        });

        fileP.then(function(file) {

          var uri = "my-gdrive://" + filename + ":" + file.getUniqueId();

          function needsCompile() { return true; }

          function getModule(self) {
            runtime.pauseStack(function(getModRestart) {
              var contentsP = file.getContents();
              contentsP.fail(function(failure) {
                getModRestart.error(runtime.ffi.makeMessageException(contentRequestFailure(failure)));
              });
              contentsP.then(function(pyretString) {
                var ret = gmf(compileLib, "pyret-string").app(pyretString);
                getModRestart.resume(ret);
              });
            });
          }

          function getDependencies(self) {
            return runtime.safeCall(function() {
              return gf(self, "get-module").app();
            }, function(mod) {
              return runtime.safeTail(function() {
                return gmf(compileLib, "get-standard-dependencies").app(mod, uri);
              });
            });
          }

          function getProvides(self) {
            return runtime.safeCall(function() {
              return gf(self, "get-module").app();
            }, function(mod) {
              return runtime.safeTail(function() {
                return gmf(compileLib, "get-provides").app(mod, uri);
              });
            });
          }

          function getExtraImports(self) {
            return gmf(compileStructs, "standard-imports");
          }

          function getGlobals(self) {
            return gmf(compileStructs, "standard-globals");
          }

          function getCompileEnv(_) {
            return gmf(compileStructs, "standard-builtins");
          }

          function getNamespace(_, otherRuntime) {
            return gmf(compileLib, "make-base-namespace").app(otherRuntime);
          }
          
          function getUri(_) { return uri; }
          function name(_) { return filename; }
          function setCompiled(_) { return runtime.nothing; }

          var m0 = runtime.makeMethod0;
          var m1 = runtime.makeMethod1;
          var m2 = runtime.makeMethod2;

          restarter.resume(runtime.makeObject({
            "needs-compile": m1(needsCompile),
            "get-module": m0(getModule),
            "get-dependencies": m0(getDependencies),
            "get-provides": m0(getProvides),
            "get-extra-imports": m0(getExtraImports),
            "get-globals": m0(getGlobals),
            "get-compile-env": m0(getCompileEnv),
            "get-namespace": m1(getNamespace),
            "uri": m0(getUri),
            "name": m0(name),
            "_equals": m2(function(self, other, rec) {
              return runtime.safeCall(function() {
                return runtime.getField(other, "uri").app();
              }, function(otherstr) {
                return runtime.safeTail(function() {
                  return rec.app(otherstr, uri);
                })
              });
            }),
            "set-compiled": m2(setCompiled),
            "get-compiled": m1(function() { return runtime.ffi.makeNone(); })
          }));
        });
      });
    }
    function makeSharedGDriveLocator(filename, id) {
      function checkFileResponse(file, filename, restarter) {
        var actualName = file.getName();
        if(actualName !== filename) {
          restarter.error(runtime.ffi.makeMessageException("Expected file with id " + id + " to have name " + filename + ", but its name was " + actualName));
        }
      }
      function contentRequestFailure(failure) {
        return "Could not load file with name " + filename;
      }

      // Pause because we'll fetch the Google Drive file object and restart
      // with it to create the actual locator
      runtime.pauseStack(function(restarter) {
        // We start by setting up the fetch of the file; lots of methods will
        // close over this.
        var filesP = storageAPI.then(function(storage) {
          return storage.api.getSharedFileById(id);
        });
        filesP.fail(function(failure) {
          restarter.error(runtime.ffi.makeMessageException(fileRequestFailure(failure, filename)));
        });
        var fileP = filesP.then(function(file) {
          checkFileResponse(file, filename, restarter);
          // checkFileResponse throws if there's an error
          return file;
        });

        fileP.then(function(file) {

          var uri = "shared-gdrive://" + filename + ":" + file.getUniqueId();

          function needsCompile() { return true; }

          function getModule(self) {
            runtime.pauseStack(function(getModRestart) {
              var contentsP = file.getContents();
              contentsP.fail(function(failure) {
                getModRestart.error(runtime.ffi.makeMessageException(contentRequestFailure(failure)));
              });
              contentsP.then(function(pyretString) {
                var ret = gmf(compileLib, "pyret-string").app(pyretString);
                getModRestart.resume(ret);
              });
            });
          }

          function getDependencies(self) {
            return runtime.safeCall(function() {
              return gf(self, "get-module").app();
            }, function(mod) {
              return runtime.safeTail(function() {
                return gmf(compileLib, "get-standard-dependencies").app(mod, uri);
              });
            });
          }

          function getProvides(self) {
            return runtime.safeCall(function() {
              return gf(self, "get-module").app();
            }, function(mod) {
              return runtime.safeTail(function() {
                return gmf(compileLib, "get-provides").app(mod, uri);
              });
            });
          }

          function getExtraImports(self) {
            return gmf(compileStructs, "standard-imports");
          }

          function getGlobals(self) {
            return gmf(compileStructs, "standard-globals");
          }

          function getCompileEnv(_) {
            return gmf(compileStructs, "standard-builtins");
          }

          function getNamespace(_, otherRuntime) {
            return gmf(compileLib, "make-base-namespace").app(otherRuntime);
          }
          
          function getUri(_) { return uri; }
          function name(_) { return filename; }
          function setCompiled(_) { return runtime.nothing; }

          var m0 = runtime.makeMethod0;
          var m1 = runtime.makeMethod1;
          var m2 = runtime.makeMethod2;

          restarter.resume(runtime.makeObject({
            "needs-compile": m1(needsCompile),
            "get-module": m0(getModule),
            "get-dependencies": m0(getDependencies),
            "get-provides": m0(getProvides),
            "get-extra-imports": m0(getExtraImports),
            "get-globals": m0(getGlobals),
            "get-compile-env": m0(getCompileEnv),
            "get-namespace": m1(getNamespace),
            "uri": m0(getUri),
            "name": m0(name),
            "_equals": m2(function(self, other, rec) {
              return runtime.safeCall(function() {
                return runtime.getField(other, "uri").app();
              }, function(otherstr) {
                return runtime.safeTail(function() {
                  return rec.app(otherstr, uri);
                })
              });
            }),
            "set-compiled": m2(setCompiled),
            "get-compiled": m1(function() { return runtime.ffi.makeNone(); })
          }));
        });
      });
    }
    function makeGDriveJSLocator(filename, id) {
      function checkFileResponse(file, filename, restarter) {
        var actualName = file.getName();
        if(actualName !== filename) {
          restarter.error(runtime.ffi.makeMessageException("Expected file with id " + id + " to have name " + filename + ", but its name was " + actualName));
        }
      }
      function contentRequestFailure(failure) {
        return "Could not load file with name " + filename;
      }

      // Pause because we'll fetch the Google Drive file object and restart
      // with it to create the actual locator
      runtime.pauseStack(function(restarter) {
        // We start by setting up the fetch of the file; lots of methods will
        // close over this.
        var filesP = storageAPI.then(function(storage) {
          return storage.api.getFileById(id);
        });
        filesP.fail(function(failure) {
          restarter.error(runtime.ffi.makeMessageException(fileRequestFailure(failure, filename)));
        });
        var fileP = filesP.then(function(file) {
          checkFileResponse(file, filename, restarter);
          // checkFileResponse throws if there's an error
          return file;
        });

        var contentsP = fileP.then(function(file) { return file.getContents(); });
        var loadedP = Q.spread([contentsP, fileP], function(contents, file) {
          var uri = "gdrive-js://" + filename + ":" + file.getUniqueId();
          return loader.goodIdea(runtime, uri, contents);
        });
        Q.spread([loadedP, fileP], function(mod, file) {

          var uri = "gdrive-js://" + filename + ":" + file.getUniqueId();

          function needsCompile() { return false; }

          function getModule(self) {
            runtime.ffi.throwMessageException("Cannot get-module of js import");
          }

          function getDependencies(self) {
            var depArray = mod.dependencies.map(function(d) {
              if(d["import-type"] === "builtin") {
                return gmf(compileStructs, "builtin").app(d.name);
              }
              else {
                return gmf(compileStructs, "dependency").app(
                  d.protocol,
                  runtime.ffi.makeList(d.args));
              }
            });
            return runtime.ffi.makeList(depArray);
          }

          function getProvides(self) {
            runtime.pauseStack(function(rs) {
              runtime.loadBuiltinModules([util.modBuiltin("string-dict")], "gdrive-js-locator", function(stringDict) {
                var sdo = gmf(stringDict, "string-dict-of");
                var l = runtime.ffi.makeList;
                var values = sdo.app(l(mod.provides.values), gmf(compileStructs, "v-just-there"));
                var types = sdo.app(l(mod.provides.types), gmf(compileStructs, "t-just-there"));
                restarter.resume(gmf(compileStructs, "provides").app(values, types));
              });
            })
          }

          function getExtraImports(self) {
            return gmf(compileStructs, "standard-imports");
          }

          function getGlobals(self) {
            return gmf(compileStructs, "standard-globals");
          }

          function getCompileEnv(_) {
            return gmf(compileStructs, "standard-builtins");
          }

          function getNamespace(_, otherRuntime) {
            return gmf(compileLib, "make-base-namespace").app(otherRuntime);
          }
          
          function getUri(_) { return uri; }
          function name(_) { return filename; }
          function setCompiled(_) { return runtime.nothing; }

          var m0 = runtime.makeMethod0;
          var m1 = runtime.makeMethod1;
          var m2 = runtime.makeMethod2;

          restarter.resume(runtime.makeObject({
            "needs-compile": m1(needsCompile),
            "get-module": m0(getModule),
            "get-dependencies": m0(getDependencies),
            "get-provides": m0(getProvides),
            "get-extra-imports": m0(getExtraImports),
            "get-globals": m0(getGlobals),
            "get-compile-env": m0(getCompileEnv),
            "get-namespace": m1(getNamespace),
            "uri": m0(getUri),
            "name": m0(name),
            "_equals": m2(function(self, other, rec) {
              return runtime.safeCall(function() {
                return runtime.getField(other, "uri").app();
              }, function(otherstr) {
                return runtime.safeTail(function() {
                  return rec.app(otherstr, uri);
                })
              });
            }),
            "set-compiled": m2(setCompiled),
            "get-compiled": m1(function() {
              return runtime.ffi.makeSome(
                  gmf(compileLib, "pre-loaded").app(
                    gmf(compileStructs, "minimal-builtins"),
                    runtime.makeOpaque(mod.theModule))
                );
            })
          }));
        });
      });
      
    }
    return {
      makeMyGDriveLocator: makeMyGDriveLocator,
      makeSharedGDriveLocator: makeSharedGDriveLocator,
      makeGDriveJSLocator: makeGDriveJSLocator
    };
  }
  return {
    makeLocatorConstructors: makeLocatorConstructors
  }
});
