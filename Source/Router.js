/*
---

name: Router

description: Router for client side web apps based on CrossroadsJS (http://millermedeiros.github.com/crossroads.js), adapted to MooTools.

authors: Christoph Pojer (@cpojer)

license: MIT-style license.

requires: [Core/Class.Extras, Core/Object]

provides: Router

...
*/

(function() {

var Route = new Class({

  Implements: Events,

  _greedy: false,
  _paramIds: null,
  _optionalParamsIds: null,
  _matchRegexp: null,
  _priority: 0,

  initialize: function(pattern, callback, priority, router) {
    this._router = router;
    this._pattern = pattern;
    this._matchRegexp = pattern;
    this._rules = {};

    if (typeOf(pattern) != 'regexp') {
      var lexer = router.getLexer();
      this._paramsIds = lexer.getParamIds(this._pattern);
      this._optionalParamsIds = lexer.getOptionalParamsIds(this._pattern);
      this._matchRegexp = lexer.compilePattern(pattern);
    }

    if (callback) this.addEvent('match', callback);
    if (priority) this._priority = priority;
  },

  match: function(request) {
    return this._matchRegexp.test(request) && this._validateParams(request);
  },

  setNormalizer: function(fn) {
    this.normalizer = fn;
    return this;
  },

  setGreedy: function(value) {
    this._greedy = !!value;
    return this;
  },

  isGreedy: function() {
    return this._greedy;
  },

  addRule: function(name, rule) {
    this._rules[name] = rule;
    return this;
  },

  addRules: function(rules) {
    Object.append(this._rules, rules);
    return this;
  },

  _validateParams: function(request) {
    var values = this._getParamsObject(request);
    return Object.every(this._rules, function(value, key) {
      if (!this._isValidParam(request, key, values)) return false;

      return true;
    }, this);
  },

  _isValidParam: function(request, key, values) {
    var validationRule = this._rules[key],
      type = typeOf(validationRule),
      val = values[key];

    if (!val && this._optionalParamsIds && this._optionalParamsIds.indexOf(key) !== -1) return true;
    else if (type == 'regexp') return validationRule.test(val);
    else if (type == 'array') return (validationRule.indexOf(val) !== -1);
    else if (type == 'function') return validationRule(val, request, values);

    return false;
  },

  _getParamsObject: function(request) {
    var values = this._router.getLexer().getParamValues(request, this._matchRegexp),
      o = {},
      n = values.length;
    while (n--) {
      o[n] = values[n]; //for RegExp pattern and also alias to normal paths
      if (this._paramsIds) o[this._paramsIds[n]] = values[n];
    }
    o.request_ = request;
    o.vals_ = values;
    return o;
  },

  _getParamsArray: function(request) {
    var norm = this.normalizer;

    if (!norm && this._router.options.normalizeFn) norm = this._router.options.normalizeFn;
    if (norm) return norm(request, this._getParamsObject(request));

    return this._router.getLexer().getParamValues(request, this._matchRegexp);
  }

});

var Router = this.Router = new Class({

  Implements: [Options, Events],

  options: {
    normalizeFn: null,
    lexer: null
  },

  initialize: function(options) {
    this.setOptions(options);

    this._lexer = this.options.lexer || Router.getDefaultLexer();
    this._routes = [];
    this._prevRoutes = [];
  },

  add: function(pattern, callback, priority) {
    var route = new Route(pattern, callback, priority, this);
    this._sortedInsert(route);
    return route;
  },

  remove: function(route) {
    var i = this._routes.indexOf(route);
    if (i !== -1) this._routes.splice(i, 1);
  },

  removeAll: function() {
    this._routes.length = 0;
  },

  parse: function(request, args) {
    request = request || '';
    if (!args) args = [];

    var routes = this._getMatchedRoutes(request),
      i = 0,
      n = routes.length,
      cur;

    if (n) {
      this._notifyPrevRoutes(request);
      this._prevRoutes = routes;
      //shold be incremental loop, execute routes in order
      while (i < n) {
        cur = routes[i];
        cur.route.fireEvent('match', args.concat(cur.params));
        cur.isFirst = !i;
        this.fireEvent('match', args.concat([request, cur]));
        i += 1;
      }

      return;
    }

    this.fireEvent('default', args.concat([request]));
  },

  _notifyPrevRoutes: function(request) {
    var i = 0, cur;
    while ((cur = this._prevRoutes[i++]))
      cur.route.fireEvent('pass', request);
  },

  _sortedInsert: function(route) {
    //simplified insertion sort
    var routes = this._routes,
      n = routes.length;
    do { --n; } while (routes[n] && route._priority <= routes[n]._priority);
    routes.splice(n + 1, 0, route);
  },

  _getMatchedRoutes: function(request) {
    var res = [],
      routes = this._routes,
      n = routes.length,
      route;

    while ((route = routes[--n])) {
      if ((!res.length || route.isGreedy()) && route.match(request)) {
        res.push({
          route: route,
          params: route._getParamsArray(request)
        });
      }
    }
    return res;
  },

  getLexer: function() {
    return this._lexer;
  }

});

    //match chars that should be escaped on string regexp
var ESCAPE_CHARS_REGEXP = /[\\.+*?\^$\[\](){}\/'#]/g,

  //trailing slashes (begin/end of string)
  LOOSE_SLASHES_REGEXP = /^\/|\/$/g,
  LEGACY_SLASHES_REGEXP = /\/$/g,

  //params - everything between `{ }` or `: :`
  PARAMS_REGEXP = /(?:\{|:)([^}:]+)(?:\}|:)/g,

  //used to save params during compile (avoid escaping things that
  //shouldn't be escaped).
  TOKENS = {
    'OS' : {
      //optional slashes
      //slash between `::` or `}:` or `\w:` or `:{?` or `}{?` or `\w{?`
      rgx : /([:}]|\w(?=\/))\/?(:|(?:\{\?))/g,
      save : '$1{{id}}$2',
      res : '\\/?'
    },
    'RS' : {
      //required slashes
      //used to insert slash between `:{` and `}{`
      rgx : /([:}])\/?(\{)/g,
      save : '$1{{id}}$2',
      res : '\\/'
    },
    'RQ' : {
      //required query string - everything in between `{? }`
      rgx : /\{\?([^}]+)\}/g,
      //everything from `?` till `#` or end of string
      res : '\\?([^#]+)'
    },
    'OQ' : {
      //optional query string - everything in between `:? :`
      rgx : /:\?([^:]+):/g,
      //everything from `?` till `#` or end of string
      res : '(?:\\?([^#]*))?'
    },
    'OR' : {
      //optional rest - everything in between `: *:`
      rgx : /:([^:]+)\*:/g,
      res : '(.*)?' // optional group to avoid passing empty string as captured
    },
    'RR' : {
      //rest param - everything in between `{ *}`
      rgx : /\{([^}]+)\*\}/g,
      res : '(.+)'
    },
    // required/optional params should come after rest segments
    'RP' : {
      //required params - everything between `{ }`
      rgx : /\{([^}]+)\}/g,
      res : '([^\\/?]+)'
    },
    'OP' : {
      //optional params - everything between `: :`
      rgx : /:([^:]+):/g,
      res : '([^\\/?]+)?\/?'
    }
  },

  LOOSE_SLASH = 1,
  STRICT_SLASH = 2,
  LEGACY_SLASH = 3,

  _slashMode = LOOSE_SLASH;

function precompileTokens() {
  var key, cur;
  for(key in TOKENS) {
    if(TOKENS.hasOwnProperty(key)) {
      cur = TOKENS[key];
      cur.id = '__CR_' + key + '__';
      cur.save = ('save' in cur) ? cur.save.replace('{{id}}', cur.id) : cur.id;
      cur.rRestore = new RegExp(cur.id, 'g');
    }
  }
}
precompileTokens();

function captureVals(regex, pattern) {
  var vals = [],
    match;
  // very important to reset lastIndex since RegExp can have "g" flag
  // and multiple runs might affect the result, specially if matching
  // same string multiple times on IE 7-8
  regex.lastIndex = 0;
  while(match = regex.exec(pattern)) {
    vals.push(match[1]);
  }
  return vals;
}

function replaceTokens(pattern, regexpName, replaceName) {
  var cur, key;
  for(key in TOKENS) {
    if(TOKENS.hasOwnProperty(key)) {
      cur = TOKENS[key];
      pattern = pattern.replace(cur[regexpName], cur[replaceName]);
    }
  }
  return pattern;
}

var lexer = {

  getParamIds: function(pattern) {
    return captureVals(PARAMS_REGEXP, pattern);
  },

  getOptionalParamsIds: function(pattern) {
    return captureVals(TOKENS.OP.rgx, pattern);
  },

  getParamValues: function(request, regexp, shouldTypecast) {
    var vals = regexp.exec(request);
    if(vals) {
      vals.shift();
      if(shouldTypecast) {
        vals = typecastArrayValues(vals);
      }
    }
    return vals;
  },

  compilePattern: function(pattern) {
    pattern = pattern || '';

    if(pattern) {
      if(_slashMode === LOOSE_SLASH) {
        pattern = pattern.replace(LOOSE_SLASHES_REGEXP, '');
      } else if(_slashMode === LEGACY_SLASH) {
        pattern = pattern.replace(LEGACY_SLASHES_REGEXP, '');
      }

      //save tokens
      pattern = replaceTokens(pattern, 'rgx', 'save');
      //regexp escape
      pattern = pattern.replace(ESCAPE_CHARS_REGEXP, '\\$&');
      //restore tokens
      pattern = replaceTokens(pattern, 'rRestore', 'res');

      if(_slashMode === LOOSE_SLASH) {
        pattern = '\\/?' + pattern;
      }
    }

    if(_slashMode !== STRICT_SLASH) {
      //single slash is treated as empty and end slash is optional
      pattern += '\\/?';
    }
    return new RegExp('^' + pattern + '$');
  },

  interpolate: function(pattern, replacements) {
    if(typeof pattern !== 'string') {
      throw new Error('Route pattern should be a string.');
    }

    var replaceFn = function(match, prop) {
        var val;
        if(prop in replacements) {
          // make sure value is a string see #gh-54
          val = String(replacements[prop]);
          if(match.indexOf('*') === -1 && val.indexOf('/') !== -1) {
            throw new Error('Invalid value "' + val + '" for segment "' + match + '".');
          }
        } else if(match.indexOf('{') !== -1) {
          throw new Error('The segment ' + match + ' is required.');
        } else {
          val = '';
        }
        return val;
      };

    if(!TOKENS.OS.trail) {
      TOKENS.OS.trail = new RegExp('(?:' + TOKENS.OS.id + ')+$');
    }

    return pattern.replace(TOKENS.OS.rgx, TOKENS.OS.save).replace(PARAMS_REGEXP, replaceFn).replace(TOKENS.OS.trail, '') // remove trailing
    .replace(TOKENS.OS.rRestore, '/'); // add slash between segments
  },

  strict: function() {
    _slashMode = STRICT_SLASH;
  },

  loose: function() {
    _slashMode = LOOSE_SLASH;
  },

  legacy: function() {
    _slashMode = LEGACY_SLASH;
  }

};

Router.getDefaultLexer = function() {
  return lexer;
};

})();
