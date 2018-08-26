'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});


var _helpers = require('../../node_modules/ava-ia/lib/helpers');
var _ = require('underscore');
var RELATIONS = ['when', 'value', 'object', 'action'];


exports.default = function (state) {
	
	return new Promise(function (resolve, reject) {
		
		// Information pour ceux que ca intéresse...
		info('***** NLP Relations ****'.yellow);
		info('state.tokens:', state.tokens);
		info('state.tags:', state.tags);
		for(var a in state.relations) {	
			info('Relations', a , ":", state.relations[a])
		}
		info('********** END *********'.yellow);
		
		var type;
		var _relation = (0, _helpers.relation)(RELATIONS, state);
		var time = _relation.when;
		
		// reformatage de la règle en francais
		state.rawSentence = state.rawSentence.replace('-', " ").replace('one', "1").replace('d\'une', "1").replace('de une', "1");
		
		// pour la pièce en multiroom
		var room = Avatar.ia.clientFromRule (state.rawSentence);
		
		for (var rule in Config.modules.freeboxTV.rules) {
			var match = (0, _helpers.syntax)(state.sentence, Config.modules.freeboxTV.rules[rule]); 
			if (match) break;
		}
		
		if (state.debug) info('ActionFreeboxTV'.bold.yellow, rule.yellow );
	
		if (rule == 'GetTVPrograms') {
		
			if (time) {
				// Test la relation "when" (format Date) retournée par NLP
				if (time instanceof Date && !isNaN(time.valueOf()) && _.indexOf(state.rawSentence.split(' '), 'de') == -1) {
					type = _relation.object || _relation.action;
					type = type.toLowerCase() == 'room' ? room : type;
					info('Date relation type:', type ? type.yellow : 'none'.red);
				} 
				
				if(!type) {
					// Test la relation "when" (format String) retournée par NLP
					time = time.toString().replace('-', " ").replace('one', "1").replace('thirty', '30');
					if (time.toLowerCase().indexOf('hour') == -1) {
						if (time.toLowerCase().indexOf('minute') == -1) {
							if (time.toLowerCase().indexOf('second') == -1) {
								info('No date relation type, searching for a value relation...');
								time = null;
							}
						} else if (time.split(' ').length == 1 || time.split(' ').length == 2) {
							// cas spécial pour 1 minute
							if (time.split(' ').length == 1)
								time = "1 minute";
							
							// cas spécial avec minute au pluriel (ex: 1 minutes 20), la traduction est pénible, en anglais c'est correct...
							if (_relation.value && Number.isInteger(parseInt(_relation.value, 10))) {
								time = time + ' ' + _relation.value; 
							} 
						} 
					}
				}
			} 
			
			if (!time && _relation.value) {
				// Relation "when" non reconnue par NLP, recherche la relation "value"
				_relation.value = _relation.value.replace('-', " ").replace('one', "1");
				if (_relation.value.toLowerCase().indexOf('h') != -1) {
					var tblTime = _relation.value.toLowerCase().split('h');
					if (tblTime.length >= 1) {
						var num = parseInt(tblTime[0], 10);
						if (!isNaN(num)) {
							time =	tblTime[0]+' hour';
							if (tblTime.length > 1) {
								var num = parseInt(tblTime[1], 10);
								if (!isNaN(num)) {
									time =	time+' '+tblTime[1]+' minute';
								}
							}
						}
					}
				} else
					time =	_relation.value;
			} 
			
			if (!time) {
				info('no value relation, searching for a native language relation...');
				// Dernier recours par la règle en francais
				var tbl_native = state.rawSentence.split(" ");
				for (var i = 0; i < tbl_native.length; i++ ) {
					if (tbl_native[i].toLowerCase().indexOf('h') != -1) {
						var tblTime = tbl_native[i].toLowerCase().split('h');
						if (tblTime.length >= 1) {
							var num = parseInt(tblTime[0], 10);
							if (!isNaN(num)) {
								time =	tblTime[0]+' hour';
								if (tblTime.length > 1) {
									var num = parseInt(tblTime[1], 10);
									if (!isNaN(num)) {
										time =	time+' '+tblTime[1]+' minute';
										break;
									}
								}
							}
						}
					}
				}
			}
			
			if (!time) {
				// leave plugin manages sentence for specific types
				time = new Date();
			}
		}
		
		setTimeout(function(){ 
			state.action = {
				module: 'freeboxTV',
				command: rule,
				room: room,
				time: time,
				raw: state.rawSentence,
				type: type
			};
			resolve(state);
		}, 500);	
		
	});
};



