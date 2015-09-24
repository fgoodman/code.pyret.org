define([
    "q",

    "compiler/compile-lib.arr",
    "compiler/compile-structs.arr",

    "compiler/locators/builtin.arr",
    "/js/cpo-builtins.js",
    "/js/gdrive-locators.js",
  ],
  function(
    q,

    compileLibLib,
    compileStructsLib,

    builtinLib,
    cpoBuiltin,
    gdriveLocators) {

  function createFindModule(storageAPI) {
    function make(runtime) {
      var findModuleP = q.defer();

      var gf = runtime.getField;
      var gmf = function(m, f) { return gf(gf(m, "values"), f); };
      var gtf = function(m, f) { return gf(m, "types")[f]; };

      runtime.loadModulesNew(runtime.namespace, [
        builtinLib,
        compileLibLib,
        compileStructsLib],
        function (
          builtin,
          compileLib,
          compileStructs) {
          
          var replNS = runtime.namespace;
          var replEnv = gmf(compileStructs, "standard-builtins");
          //var constructors = gdriveLocators.makeLocatorConstructors(storageAPI, runtime, compileLib, compileStructs);

          function findModule(contextIgnored, dependency) {
            return runtime.safeCall(function() {
              return runtime.ffi.cases(gmf(compileStructs, "is-Dependency"), "Dependency", dependency, {
                builtin: function(name) {
                          return gmf(builtin, "make-builtin-locator").app(name); 
                         }}); // Add Google drive later!
            }, function (locator) {
              return gmf(compileLib, "located").app(locator, runtime.nothing);
            });
          }
          findModuleP.resolve(findModule);
        });
      return findModuleP.promise;
    }
    return make;
  }

  return {createFindModule: createFindModule};
});
