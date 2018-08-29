var Promise = require('q').Promise;
var _ = require('underscore');
var request = require('request');
var moment = require('moment');
var soundex   = require('./node_modules/soundex/soundex.js').soundex;
var clj_fuzzy = require('./node_modules/clj-fuzzy');
var TVChannels = [];

require('colors');



exports.cron = function(data){
	
	if (!Avatar.currentRoom) 
		Avatar.currentRoom = Config.default.client;	
	
	// Client présent ?
	if (!Avatar.Socket.getClientSocket(Avatar.currentRoom))
		return info('freeboxTV Cron:', 'Le client',  Avatar.currentRoom, 'n\'est pas connecté');

	var tvSchedule = require('./tvScheduledb')({
		lang: "FR_fr",
		client: Avatar.currentRoom,
		fifo: 'false',
		autoDestroy: 'true',
		debug: 'true'
	});
	
	var _ISO_X = moment().format("YYYY-MM-DDTHH:mm");
	var _X = Math.floor(moment(_ISO_X).format("X"));
	var bouquetID = Config.modules.freeboxTV.bouquets[0];
	getBouquets()
	.then(body => getBouquetID(body, bouquetID))
	.then(id => getBouquetChannels(id))
	.then(channels => getInfosChannels(channels))
	.then(function(bouquetChannels) { 
		getPrograms (bouquetChannels, _X, _ISO_X, 0, bouquetChannels.length, [], function (programs) { 
			if (programs && programs.length > 0)
				tvSchedule.Tvcron(programs);
		});
	})
	.catch(function(err) {
		error((err && err.length > 0)? err.red : "Impossible de récupérer les programmes sur la freeBox".red);
	});
	
}



exports.init = function(){
	
	 getAllChannels()
	 .then ( function (allChannels) { 
		return new Promise(function (resolve, reject) {
			getBouquets()
			.then(body => getBouquetID(body, Config.modules.freeboxTV.Freebox))
			.then(id => getBouquetChannels(id, true))
			.then(channels => availableChannels(allChannels, channels))
			.then(nbChannels => resolve (nbChannels))
			.catch(function(err) {
				reject (err);
			});
		});
	 })
	 .then (function(nbChannels) {
		// Chaines sur la box
		info('Number of available TV channels found from Freebox Player:', nbChannels.toString().yellow);
	 })
	.catch(function(err) {
		error(err && err.length > 0 ? err.red : "Impossible de récupérer les programmes sur la freeBox".red);
	});

}



exports.action = function(data, callback){
	
	var tblActions = {
		GetTVPrograms: function() {getTVPrograms(data.client, data.action.time, data.action.type)},
		tvShow: function() {tvShow(data.client, data.action.title, data.action.hour, data.action.duration, data.action.channelID, data.action.channelName)},
		recorded: function() {recordedProgram(data.client)}
	};
	
	var client = setClient(data);
	info("freeboxTV command:", data.action.command.yellow, "From:", data.client.yellow, "To:", client.yellow);
	tblActions[data.action.command]();
	
	callback();
}


var setClient = function (data) {
	
	// client direct (la commande provient du client et est exécutée sur le client)
	var client = data.client;	
	// Client spécifique fixe (la commande ne provient pas du client et n'est pas exécutée sur le client et ne peut pas changer)
	if (data.action.room) 
		client = (data.action.room != 'current') ? data.action.room : (Avatar.currentRoom) ? Avatar.currentRoom : Config.default.client;

	// Client spécifique non fixe dans la commande HTTP (la commande ne provient pas du client et n'est pas exécutée sur le client et peut changer)
	if (data.action.setRoom) 
		client = data.action.setRoom;
	
	return client;
}


var recordedProgram = function(client) {
		
	var tvCron = require('./tvScheduledb')({
		lang: "FR_fr",
		client: client,
		fifo: 'false',
		autoDestroy: 'true',
		debug: 'true'});
	tvCron.isRecords();
}


var tvShow = function (client, title, hour, duration, channelID, channelName) {
	
	info('TV program on', client.yellow);
		
	isPlayerOn ( function (state) {
		switch (state) {
			case true: 
			    var tts = Config.modules.freeboxTV.tvProgFound;
				tts = tts.split('|')[Math.floor(Math.random() * tts.split('|').length)].replace('%s',title).replace('%c',channelName);
				Avatar.askme(tts , client, 
				Config.modules.freeboxTV.askSetProgramTV
				, 0, function(answer, end){
					switch (answer) {
					case 'sommaire':
						end(client);
						Avatar.speak("Oui vas-y ou oui s'il te plait. Non enregistre. Non c'est bon ou non merci.", client, function(){
							setTimeout(function(){
								tvShow(client, title, hour, duration, channelID, channelName);
							}, 3000);
						}); 
						break;
					case 'yes':
						Avatar.speak("Ok, je met %s".replace('%s',title), client, function(){
							end(client,true);
							Avatar.call('freebox', {command: 'setChannel', key: channelID.toString(), client: client});
						}); 
						break; 
					case 'record':
						Avatar.speak("D'accord, je dois intérrompre ton programme 1 minute le temps de le programmer.", client, function(){
							end(client,true);
							Avatar.call('freebox', {command: 'recordProgram', hour: hour, duration: duration, ID: channelID.toString(), afterRecord: true, client: client});
						}); 
						break; 
					case 'cancel':
						Avatar.speak("D'accord", client, function(){	
							end(client,true);
						}); 
						break;
					default:
						Avatar.speak("Ok, j'ai rien dit...", client); 
						break;			
					}					
				});
				break;
			case false:	
				Avatar.call('freebox', {command: 'recordProgram', hour: hour, duration: duration, ID: channelID.toString(), client: client}, function(cb){
					setTimeout(function(){			
						var tvCron = require('./tvScheduledb')({
							lang: "FR_fr",
							client: client,
							fifo: 'false',
							autoDestroy: 'true',
							debug: 'true'});
						tvCron.RememberRecord(title,
											  moment().format("YYYY-MM-DD"),
											  hour,
											  duration,
											  channelID,
											  channelName);
					}, 20000);
				});
				break;
			default:
				info("Le plugin freebox est manquant, je ne peux pas mettre le programme %s".replace('%s',title));
				break;
		}
	});
}



var isPlayerOn = function (callback) {
	
	if (!Avatar.exists('freebox'))
		return callback(-1);
		
	var token = require('../freebox/node_modules/token/token')();
	token.PlayerOn(Config.modules.freebox.auth.app_token, Config.modules.freebox.auth.app_id, Config.modules.freebox.auth.app_version, function(state) {  
		if (state == -1) {
			error('il n\'y a pas de jeton pour la freebox');
			return callback(-1);
		}
		callback(state);
	});
	
}





function getTVPrograms(client, time, type) {
	
	if (time && time instanceof Date && !isNaN(time.valueOf())) {
		
		var _ISO_now = moment().format("YYYY-MM-DDTHH:mm");
		var month = parseInt(time.getMonth()+1).toString();
		month = month.length == 1 ? '0' + month : month;
		var day = time.getDate().toString();
		day = day.length == 1 ? '0' + day : day;
		var hour = time.getHours().toString();
		hour = hour.length == 1 ? '0' + hour : hour;
		var minutes = time.getMinutes().toString();
		minutes =  minutes.length == 1 ? '0' + minutes : minutes;
		var _ISO_X = time.getFullYear()+'-'+month+'-'+day+'T'+hour+':'+minutes;
		
		// Date avant aujourd'hui
		if (moment(_ISO_now).isBefore(_ISO_X) == false && moment(_ISO_now).isSame(_ISO_X) == false) {
			return Avatar.speak("J'ai compris une date antérieure à maintenant, recommence sans préciser le moment.", client, function () { 
					var clientSocket = Avatar.Socket.getClientSocket(client);
					if (clientSocket)
							clientSocket.emit('listen_again');
				});
		}
		
		// 6 jours maxi
		var maxDate = moment(_ISO_now).add(7, 'days').format("YYYY-MM-DDTHH:mm");
		if (moment(_ISO_X).isAfter(maxDate) == true) {
			return Avatar.speak("Je ne peux pas voir les programmes à plus de 6 jours", client, function () { 
				Avatar.Speech.end(client); 
			});
		}
		
		var _X = Math.floor(moment(_ISO_X).format("X"));
		return getProgramsInBouquet(client, _X, _ISO_X);
	}
	
	return Avatar.speak("Je n'ai rien compris, recommence.", client, function () { 
			var clientSocket = Avatar.Socket.getClientSocket(client);
			if (clientSocket)
					clientSocket.emit('listen_again');
	});

}




function getProgramsInBouquet (client, _X, _ISO_X) {
	
	var bouquetID = Config.modules.freeboxTV.bouquets[0];
	getBouquets()
	.then(body => getBouquetID(body, bouquetID))
	.then(id => getBouquetChannels(id))
	.then(channels => getInfosChannels(channels))
	.then(bouquetChannels => getBouquetPrograms(bouquetChannels, client, _X, _ISO_X))
	.catch(function(err) {
		error((err && err.length > 0)? err.red : "Impossible de récupérer les programmes sur la freeBox".red);
		return Avatar.speak("Je ne suis pas arrivé à récupérer les programmes", client, function () { 
				Avatar.Speech.end(client); 
		});
	});
}



function getBouquetPrograms (bouquetChannels, client, _X, _ISO_X) {
	
	getPrograms (bouquetChannels, _X, _ISO_X, 0, bouquetChannels.length, [], function (programs) { 
		if (!programs || programs.length == 0) {
			return Avatar.speak("Je n'ai trouvé aucun programme", client, function () {
				Avatar.Speech.end(client);
			});
		}
		
		TvAction('Tu recherches quoi?|Qu\'est ce que je peux faire pour toi ?', programs, client);
	
		/*for (var i in programs) {
			info(programs[i].uuid + ', ' + programs[i].number + ', ' +  programs[i].name+ ', ' + programs[i].title+ ', ' + programs[i].sub_title+ ', ' + programs[i].season_number+ ', ' + programs[i].episode_number+ ', ' + programs[i].category_name+ ', ' + programs[i].id+ ', '+programs[i].start+ ', '+programs[i].end+ ', '+programs[i].X)
		}*/
	});

}



function mapChannel (sentence, channel) {
	
	var tblsentence = sentence.split(' ');
	var tblLexicChannel = [];
	var tblchannel;
	var lexic = [];
	var count;
	
	for (var i in Config.modules.freeboxTV.lexic) {
		if (i.toLowerCase() == channel.toLowerCase())
			tblLexicChannel = Config.modules.freeboxTV.lexic[i];
	}
	if (tblLexicChannel.length == 0)
		tblLexicChannel[0] = channel;
	
	for (var e = 0; e < tblLexicChannel.length; e++) {
		tblchannel = tblLexicChannel[e].split(' ');
		count = 0;
		for (var i in tblsentence) {
			for (var a in tblchannel) {
				if (tblchannel[a].toLowerCase() == tblsentence[i].toLowerCase())
					count++;
			}	
		}
		
		if (count > 0) {
			lexic.push({name: tblLexicChannel[e], count: count, on: tblchannel.length});
			if (tblLexicChannel.length == 1) break;
		}
	}

	count = 0;
	for (var i in lexic) {
		if (lexic[i].count == lexic[i].on) {
			count = channel.split(' ').length;
			break;
		}
	}
	
	return count.toString()+'/'+channel.split(' ').length.toString();
	
}



function TvAction(tts, programs, client) {
	
	
	Avatar.askme (tts, client,
	{
		"*" : "choice",
		"terminer" : "cancel",
		"non c'est bon" : "cancel",
		"merci sarah" : "cancel"
	}, 0, function (answer, end) {
		
		if (!answer) {
			end(client);
			return TvAction("je n'ai pas compris, recommence", programs, client);
		}
		
		if (answer.indexOf('choice') != -1) {
			end(client);
			
			var choice = answer.split(':')[1];
			var found;
			
			info('Choice', choice.yellow);
			
			// ennumère les catégories
			if (choice.toLowerCase().indexOf("les catégories") != -1) {
				return showCategory(programs, client);
			}
			
			// Recherche par nom de chaine
			var channels = _.indexBy(programs, 'name');
			var match = 0;
			var tblchannel = [];
			for (var channel in channels) {
				var s_count = mapChannel(choice, channel);
				var count = parseInt(s_count.split('/')[0]);
				var on = parseInt(s_count.split('/')[1]);
				if (count >= match && count > 0) {
					tblchannel.push({channel: channel, match: count, on: on});
					match = count;
				}
			}	
			if (tblchannel.length > 0) {
				for (var i in tblchannel) {
					if (tblchannel[i].match == tblchannel[i].on) {
						return byChannel("channel", tblchannel[i].channel, programs, client);
					}
				}
			}
			
			// Recherche par Catégories
			var category = _.indexBy(programs, 'category_name');
			for (var i in category) {
				var tbl_category = i.split('/');
				for (var a in tbl_category) {
					if (choice.toLowerCase().indexOf(tbl_category[a].toLowerCase()) != -1) {
						return byCategory("category", i, programs, client);
					}
				}
			}
			
			// At least
			return TvAction("je n'ai pas compris, recommence", programs, client);
			
		}
		
		return Avatar.speak("d'accord|Terminé", client, function () {
			end(client, true);
		});
	});
	
}



function showCategory(programs, client) {
	
	var categories = _.uniq(_.pluck(programs, 'category_name'));
	var tts = "J'ai relevé "+categories.length+" catégories où je peux te donner les programmes. ";
	for (var category in categories) {
		if (categories[category]) {
			tts += ". "+categories[category].replace('/', ' ou ');
		}
	}
	
	Avatar.speak(tts, client, function() { 
		setTimeout(function(){ 
			TvAction('Autre chose ?', programs, client);
		}, 1000);
	});
}


function byChannel(action, channel, programs, client) {
	
	var evens = _.filter(programs, function(num){ 
		return num.name == channel; 	
	});
	
	if (!evens || evens.length == 0)
		return TvAction('Je n\'ai pas trouvé '+channel+'. Une autre chaine ?', programs, client);
	
	program_list(action, channel, evens, 0, evens.length, programs, true, client);
	
}



function byCategory(action, category, programs, client) {
	
	var evens = _.filter(programs, function(num){ 
		return num.category_name == category; 	
	});
	
	if (!evens || evens.length == 0)
		return TvAction('Je n\'ai pas trouvé de '+category+'. Une autre catégorie ?', programs, client);
	else {
		
		evens = _.sortBy(evens, 'number');
		
		Avatar.speak("J'ai trouvé "+evens.length+" "+category.split('/')[0]+".", client, function() { 
			setTimeout(function(){ 
				program_list(action, category, evens, 0, evens.length, programs, true, client);
			}, 1000);
		});	
	}

}


function program_list(action, category, evens, pos, max, programs, flagtts, client) {
	
	if (pos == max) {
		var ttsdone =  (action == 'category') ? 'Les programmes dans une autre catégorie ?' : 'Peut-être le programme sur une autre chaine ?';
		return TvAction(ttsdone, programs, client);
	}
	
	var currentHour = moment().format("YYYY-MM-DDTHH:mm");
	var progHour = moment(evens[pos].start);
	var diffMn = parseInt(progHour.diff(currentHour,"minutes"));
	info("Offset in minutes:", diffMn.toString().yellow);	
	var flagStarted;
	
	if (diffMn == 0) {
		flagStarted = true;
		var ttsHour = "maintenant";
	} else if (diffMn < 0) {
		flagStarted = true;
		diffMn = diffMn * -1;
		var hour = Math.floor(diffMn/60),
		Minutes = diffMn%60,
		ttsHour =  'Commencé depuis %d'.replace('%d', ((hour > 0) ? hour + ' heure' : '') + ((Minutes > 0) ? ' ' + Minutes + ' minute' : ''));
	} else if (diffMn > 0) 
		var ttsHour = 'A ' + evens[pos].start.split('T')[1];
	
	var tts = (flagtts) 
				? 'Sur ' + evens[pos].name + ' ' + ttsHour + ' ' + evens[pos].title + ((evens[pos].sub_title) ? ' .' + evens[pos].sub_title : '') + ((evens[pos].season_number) ? ' .Saison ' + evens[pos].season_number : '') + ((evens[pos].episode_number) ? ' .Episode ' + evens[pos].episode_number : '')
				: (action == 'caterory') ? "Quelque chose d'autre dans les "+category+" ?" : "Tu veux autre chose pour ce programme ?";	
	
	Avatar.askme (tts, client, 
	Config.modules.freeboxTV.askme_programTV
	, 0, function (answer, end) {
		switch (answer) {
			case 'sommaire':
				end(client);
				Avatar.speak("Tu peux dire: répère ou encore, donne-moi le résumé ou résumé complet, suivant ou passe au suivant, a gauche, a droite, a quelle heure, tu peux le programmer ou programme le, enregistre le, mets le, rappelle le moi, reviens au sommaire ou au type, non c'est bon, non merci, merci sarah ou terminé.", client, function() { 
					program_list(action, category, evens, max, max, programs, false, client);
				});	
				break;
			case 'done':
				end(client);
				Avatar.speak("d'accord|parfait", client, function() { 
					program_list(action, category, evens, max, max, programs, false, client);
				});	
				break;
			case 'again':
				end(client);
				program_list(action, category, evens, pos, max, programs, true, client);
				break;
			case 'hour':
				end(client);
				Avatar.speak((ttsHour), client, function(){
					setTimeout(function(){ 
						program_list(action, category, evens, pos, max, programs, false, client);
					}, 500);
				}); 
				break;
			case 'resume':
			case 'fullresume':
				end(client);
				var _Xnow = Math.floor(moment(timeConverter(evens[pos].X)).format("x"));
				getResume(evens[pos].id, _Xnow, ((answer == 'resume') ? "short_desc" : "desc"))
				.then (function(descr) {  
					if (descr)
						Avatar.speak(descr, client, function(){
							program_list(action, category, evens, pos, max, programs, false, client);
							
						});
					else
						Avatar.speak("Je ne suis pas arrivé à récupérer le résumé.", client, function(){
							program_list(action, category, evens, pos, max, programs, false, client);
						});
				})
				.catch(function(err) {
					Avatar.speak("Je ne suis pas arrivé à récupérer le résumé.", client, function(){
						program_list(action, category, evens, pos, max, programs, false, client);
					});
					error((err && err.length > 0) ? err : "Impossible de récupérer le résumé du programme");
				});
				break;
			case 'setIt':
				end(client);
				Avatar.speak("Je met %s".replace('%s',evens[pos].title), client, function(){
					Avatar.call('freebox', {command: 'setChannel', client: client, key:evens[pos].number.toString()}, function(cb){ 
						setTimeout(function(){ 
							program_list(action, category, evens, pos, max, programs, false, client);
						}, 500);
					});
				}); 
				break; 
			case 'record':
				end(client);
				Avatar.speak("D'accord, je dois intérrompre ton programme 1 minute le temps de le programmer.", client, function(){
					Avatar.call('freebox', {command: 'recordProgram', hour: evens[pos].start.split('T')[1], duration: evens[pos].duration, ID: evens[pos].number.toString(), afterRecord: true, client: client}, function() {
						setTimeout(function(){ 
							program_list(action, category, evens, pos, max, programs, false, client);
						}, 500);
					});
				}); 
				break; 
			case 'recorder':
				end(client);
				TvCron(client, evens[pos], function () {
					program_list(action, category, evens, pos, max, programs, false, client);
				});
				break;
			case 'programme':
				end(client);
				if (!flagStarted) {
					recordProgram (client, evens[pos].title, evens[pos].number, evens[pos].start.split('T')[1], evens[pos].start, function () {
						setTimeout(function(){ 
							program_list(action, category, evens, pos, max, programs, false, client);
						}, 500);
					});
				} else {
					Avatar.askme("Ce programme est déjà commencé, veux-tu que je le mette ?", client, 
					Config.modules.freeboxTV.recordAlreadyStarted
					, 0, function(answerNext, end){
						end(client);
						switch (answerNext) {
						case 'yes':
							Avatar.call('freebox', {command: 'setChannel', client: client, key:evens[pos].number.toString()}, function(cb){ 
								setTimeout(function(){ 
									program_list(action, category, evens, pos, max, programs, false, client);
								}, 500);
							});
							break; 
						case 'cancel':
						default:
							program_list(action, category, evens, pos, max, programs, false, client);
							break;			
						}					
					});
				}
				break;
			case 'previousprog':
				end(client);
				if (evens[pos].prev && evens[pos].prev != 'fake_prev') {
					getPrevNextProgram ('prev', evens, pos, client, true, function () { 
						program_list(action, category, evens, pos, max, programs, false, client);
					});
				} else {
					Avatar.speak("Je n'ai pas trouvé de programme précédent.", client, function(){
						program_list(action, category, evens, pos, max, programs, false, client);
					});
				}
				break;
			case 'nextprog':
				end(client);
				if (evens[pos].next && evens[pos].next != 'fake_next') {		
					getPrevNextProgram ('next', evens, pos, client, true, function () { 
						program_list(action, category, evens, pos, max, programs, false, client);
					});	
				} else {
					Avatar.speak("Je n'ai pas trouvé de programme suivant.", client, function(){
						program_list(action, category, evens, pos, max, programs, false, client);
					});
				}
				break;
			case 'next':
				end(client);
				if (action == 'category') {
					if (pos + 1 == evens.length) {
						Avatar.speak("C'est tout pour les %s.".replace('%s', category) , client, function(){
							program_list(action, category, evens, ++pos, max, programs, false, client);
						});
					} else 
						program_list(action, category, evens, ++pos, max, programs, true, client);
				} else 
					program_list(action, category, evens, max, max, programs, true, client);
				break;	
			case 'SARAHcancel':
			case 'Sarahcancel':
				Avatar.speak("De rien|je t'en pris|Avec plaisir", client, function() { 
					end(client, true);
				});	
				break;
			case 'cancel':
			default:
				Avatar.speak("D'accord|Terminé", client, function() { 
					end(client, true);
				});	
				break;
		}
	});
	
}




var recordProgram = function (client, title, channelId, hourStart, day, callback) {
	
	if (Avatar.exists('scenariz')) {
		var days = setPosDay(day);
		var ExecTask = {command:'saveCron', 
						client: client, 
						cronClient : 'currentRoom',
						program: "%s à %d".replace('%s',title).replace('%d',hourStart),
						name: "%s à %d".replace('%s',title).replace('%d',hourStart),
						exec : 'true',
						start: hourStart + days,
						ttsCron: "Il est %d, tu m'as demandé de mettre %s".replace('%s',title).replace('%d',hourStart),
						autodestroy : 'true',
						plug: 'freebox',
						key: 'command=setChannel~client=Salon~key=' + channelId.toString()
						};
		Avatar.call('scenariz', ExecTask, function(cb){ 
			setTimeout(function(){
				callback();
			}, 500);
		});
			
	} else {
		Avatar.speak("Le plugin scénarize est manquant, je ne peux pas enregistrer le programme %s".replace('%s',title), client, function() {
			callback();
		});	
		
	}
}



var setPosDay = function (day) {
	moment.locale('fr');
	switch (moment(day).format('dddd').toLowerCase()) {
		case 'lundi': return "-1000000";
		case 'mardi': return "-0100000";
		case 'mercredi': return "-0010000";
		case 'jeudi': return "-0001000";
		case 'vendredi': return "-0000100";
		case 'samedi': return "-0000010";
		case 'dimanche': return "-0000001";
		default:  		   return "-1111111";
	}
}



function getPrevNextProgram (sens, evens, pos, client, flagtts, callback) {
	
	var ISO_X = timeConverter(sens == 'prev' ? evens[pos].prev : evens[pos].next);
					
	getPrograms (evens, (sens == 'prev' ? evens[pos].prev : evens[pos].next), ISO_X, pos, pos + 1, [], function (tvprev) {
		
		if (tvprev && tvprev.length == 1) {
			
			var currentHour = moment().format("YYYY-MM-DDTHH:mm");
			var tts;
			if (moment(tvprev[0].end).isAfter(currentHour) == true) {
			
				var progHour = moment(tvprev[0].start);
				var diffMn = parseInt(progHour.diff(currentHour,"minutes"));
				info("Offset in minutes:", diffMn.toString().yellow);	
				var flagStarted;
				
				if (diffMn == 0) {
					flagStarted = true;
					var ttsHour = "maintenant";
				} else if (diffMn < 0) {
					flagStarted = true;
					diffMn = diffMn * -1;
					var hour = Math.floor(diffMn/60),
					Minutes = diffMn%60,
					ttsHour =  'Commencé depuis %d'.replace('%d', ((hour > 0) ? hour + ' heure' : '') + ((Minutes > 0) ? ' ' + Minutes + ' minute' : ''));
				} else if (diffMn > 0) 
					var ttsHour = 'A ' + tvprev[0].start.split('T')[1];
				
				tts = (flagtts) 
						? ttsHour + ' ' + tvprev[0].title + ((tvprev[0].sub_title) ? ' .' + tvprev[0].sub_title : '') + ((tvprev[0].season_number) ? ' .Saison ' + tvprev[0].season_number : '') + ((tvprev[0].episode_number) ? ' .Episode ' + tvprev[0].episode_number : '')
						: "Autre chose ?";	
			} else
				tts = 'A ' + tvprev[0].start.split('T')[1] + ", il y avait " + tvprev[0].title+" mais c\'est terminé.";	
			
			Avatar.askme (tts, client, 
			Config.modules.freeboxTV.askme_PrevNextPrg
			, 0, function (answer, end) {
				switch (answer) {
					case 'setIt':
						end(client);
						Avatar.speak("Je met %s".replace('%s',tvprev[0].title), client, function(){
							Avatar.call('freebox', {command: 'setChannel', client: client, key:tvprev[0].number.toString()}, function(cb){ 
								setTimeout(function(){ 
									getPrevNextProgram (sens, evens, pos, client, false, callback);
								}, 500);
							});
						}); 
					break; 
					case 'record':
						end(client);
						Avatar.speak("D'accord, je dois intérrompre ton programme 1 minute le temps de le programmer.", client, function(){
							Avatar.call('freebox', {command: 'recordProgram', hour: tvprev[0].start.split('T')[1], duration: tvprev[0].duration, ID: tvprev[0].number.toString(), afterRecord: true, client: client}, function() {
								setTimeout(function(){ 
									getPrevNextProgram (sens, evens, pos, client, false, callback);
								}, 500);
							});
						}); 
						break; 
					case 'recorder':
						end(client);
						TvCron(client, tvprev[0], function () {
							getPrevNextProgram (sens, evens, pos, client, false, callback);
						});
						break;
					case 'programme':
						end(client);
						if (!flagStarted) {
							recordProgram (client, tvprev[0].title, tvprev[0].number, tvprev[0].start.split('T')[1], tvprev[0].start, function () {
								setTimeout(function(){ 
									getPrevNextProgram (sens, evens, pos, client, false, callback);
								}, 500);
							});
						} else {
							Avatar.askme("Ce programme est déjà commencé, veux-tu que je le mette ?", client, 
							Config.modules.freeboxTV.recordAlreadyStarted
							, 0, function(answerNext, end){
								end(client);
								switch (answerNext) {
								case 'yes':
									Avatar.call('freebox', {command: 'setChannel', client: client, key:tvprev[0].number.toString()}, function(cb){ 
										setTimeout(function(){ 
											getPrevNextProgram (sens, evens, pos, client, false, callback);
										}, 500);
									});
									break; 
								case 'cancel':
								default:
									getPrevNextProgram (sens, evens, pos, client, false, callback);
									break;			
								}					
							});
						}
						break;
					case 'previous':
						end(client);
						if (moment(tvprev[0].end).isAfter(currentHour) == true) {
							if (tvprev[0].prev && tvprev[0].prev != 'fake_prev') {
								getPrevNextProgram ('prev', tvprev, 0, client, true, callback);
							} else {
								Avatar.speak("Il n'y a pas de programme precédent.", client, function(){
									getPrevNextProgram (sens, evens, pos, client, false, callback);
								});
							}
						} else {
							Avatar.speak("Tu ne peux plus aller sur la gauche, dis: à droite pour le programme suivant ou terminer, retour pour revenir au programme courant.", client, function(){
								getPrevNextProgram (sens, evens, pos, client, false, callback);
							});
						}
						break;
					case 'next':
						end(client);
						if (tvprev[0].next && tvprev[0].next != 'fake_next') {
							getPrevNextProgram ('next', tvprev, 0, client, true, callback);
						} else {
							Avatar.speak("Il n'y a pas de programme suivant.", client, function(){
								getPrevNextProgram (sens, evens, pos, client, false, callback);
							});
						}
					break;	
					default:
					case 'done' : 
						end(client);
						callback();
						break;
				}
			});
			
		} else {
			Avatar.speak((sens == 'prev') ? "Il n'y a pas de programme precédent." : "Il n'y a pas de programme suivant.", client, function(){
				callback();
			});
		}
	}, (sens == 'prev' ? evens[pos].prev : evens[pos].next) );
	 
	
}



var TvCron = function (client, program, callback) {

	if (program.title) {
		var tvCron = require('./tvScheduledb')({
					lang: "FR_fr",
					client: client,
					fifo: 'false',
					autoDestroy: 'true',
					debug: 'true'});
		tvCron.TvSave(program.title,
					program.number,
					program.name);
		setTimeout(function(){
			callback();
		}, 3000);	
	} else {
		info("Je ne peux pas te rappeler un programme sans titre");
		callback();	
	}
}


function timeConverter(UNIX_timestamp){
	
	var time = new Date(UNIX_timestamp * 1000);
	var month = parseInt(time.getMonth()+1).toString();
	month = month.length == 1 ? '0' + month : month;
	var day = time.getDate().toString();
	day = day.length == 1 ? '0' + day : day;
	var hour = time.getHours().toString();
	hour = hour.length == 1 ? '0' + hour : hour;
	var minutes = time.getMinutes().toString();
	minutes =  minutes.length == 1 ? '0' + minutes : minutes;
	return time.getFullYear()+'-'+month+'-'+day+'T'+hour+':'+minutes;
	
}


function getPrograms (bouquetChannels, _X, _ISO_X, pos, max, programs, callback, linkTo) {
	
	if (pos == max) return callback (programs);
	
	var url = "http://mafreebox.freebox.fr/api/v5/tv/epg/by_channel/" + bouquetChannels[pos].uuid + "/" + _X;
	
	request({ 'uri': url}, function (err, response, body) {
		if (err || response.statusCode != 200) 
		   return callback(false);
		
		body = JSON.parse(body);
		
		var endTime, flagfound;
		for(var i in body.result) {
		    var startTime = timeConverter(body.result[i].date);
			endTime = moment(startTime).add(body.result[i].duration, 'seconds').format("YYYY-MM-DDTHH:mm");
			if (!linkTo && !moment(_ISO_X).isAfter(endTime) && !moment(startTime).isAfter(_ISO_X) == true) {
				flagfound = true;
				break;
			}
			
			if (linkTo && body.result[i].date == linkTo) {
				flagfound = true;
				break;
			} 
		}

		//var duration = timeConverter(body.result[i].duration);
		//var duration = "";
		var diffMn = parseInt(moment(endTime).diff(startTime,"minutes"));
		var hour = Math.floor(diffMn/60);
		var minutes = diffMn%60;
		var duration = ((hour > 0) ? hour.toString().length == 1 ? '0' + hour.toString() : hour.toString() : "00")+":"+((minutes > 0) ? minutes.toString().length == 1 ? '0' + minutes.toString() : minutes.toString() : "00");
		var title = body.result[i].Title ? body.result[i].Title : body.result[i].title ? body.result[i].title : false;
		if (flagfound && title && title != Config.modules.freeboxTV.label_no_program)
			programs.push({	name: bouquetChannels[pos].name,
							number: bouquetChannels[pos].number,
							uuid: bouquetChannels[pos].uuid,
							title: title,
							sub_title: body.result[i].sub_title ? body.result[i].sub_title : false,
							category_name: body.result[i].category_name ? body.result[i].category_name : false,
							season_number: body.result[i].season_number ? body.result[i].season_number : false,
							episode_number: body.result[i].episode_number ? body.result[i].episode_number : false,
							id: body.result[i].id, 
							start: startTime,
							end: endTime,
							duration: duration,
							next: body.result[i].next ? body.result[i].next.split('_')[0] : false,
							prev: body.result[i].prev ? body.result[i].prev.split('_')[0] : false,
							X: body.result[i].date});
		
		getPrograms(bouquetChannels, _X, _ISO_X, ++pos, max, programs, callback);
		
	});
	

}



function getResume(uuid, X_time, type) {
	return new Promise(function (resolve, reject) {
		var url = "http://mafreebox.freebox.fr/api/v5/tv/epg/programs/"+uuid+"?_dc="+X_time;
		request({ 'uri': url}, function (err, response, body) {
			if (err || response.statusCode != 200) 
			   return reject('pas bon le résumé de programme');
			
			body = JSON.parse(body);
			
			resolve (body.result[type] ? body.result[type] : null);
		});
	});
}





function getAllChannels() {
	return new Promise(function (resolve, reject) {
		var url = "http://mafreebox.freebox.fr/api/v5/tv/channels";
		request({ 'uri': url}, function (err, response, body) {
			if (err || response.statusCode != 200) 
			   return reject('pas bon toutes les chaines');
			
			body = JSON.parse(body);
			
			var even = _.filter(body.result, function(num){
				return num.available == true; 
			});
			
			resolve (even);
		});
	});
}



function getBouquets() {
	return new Promise(function (resolve, reject) {
		var url = "http://mafreebox.freebox.fr/api/v5/tv/bouquets";
		request({ 'uri': url}, function (err, response, body) {
			if (err || response.statusCode != 200) 
			   return reject('pas bon bouquet');
			
			body = JSON.parse(body);
			resolve (body);
		});
	});
}



function getBouquetID(body, name) {
	return new Promise(function (resolve, reject) {
		var even = _.find(body.result, function(num){
			return num.name == name; 
		});
		
		if (!even) return  reject('pas bon getBouquetID');
		resolve (even.id);
	});
	
}


function getBouquetChannels(id, filter) {
	return new Promise(function (resolve, reject) {
		var url = "http://mafreebox.freebox.fr/api/v5/tv/bouquets/"+id+"/channels";		
		request({ 'uri': url}, function (err, response, body) {
			if (err || response.statusCode != 200) 
			   return reject('pas bon channels du bouquet');
		   
			body = JSON.parse(body);
			
			var even = (filter) ? 
				_.filter(body.result, function(num){
					return num.available == true; 
				})
				: body.result;
				
			resolve (even);
		});
	});
}



function availableChannels (allChannels, channels) {
	
	return new Promise(function (resolve, reject) {
		_.map(channels, function(channel){ 
			var even = _.find(allChannels, function(num){ return num.uuid == channel.uuid; });
			if (even) TVChannels.push ({uuid:even.uuid, name:even.name, short_name:even.short_name, number:channel.number});
		});
		
		resolve (TVChannels.length);
	});
}


function getInfosChannels (channels) {
	
	return new Promise(function (resolve, reject) {
		var bouquetTV = [];
		_.map(channels, function(channel){ 
			var even = _.find(TVChannels, function(num){ return num.uuid == channel.uuid; });
			if (even) bouquetTV.push(even);
		});
		
		info('Number of available TV channels found from', Config.modules.freeboxTV.bouquets[0] + ':', (bouquetTV.length).toString().yellow);
		
		resolve (bouquetTV);
	});
}


