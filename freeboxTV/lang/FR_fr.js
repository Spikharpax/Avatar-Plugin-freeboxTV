/*
messages
*/
var messages = {
	debug: "tvSchedule: mode debug activé.",
	terminateAsk: "Terminé",
	terminateSarahAsk: "De rien|je t'en pris|Avec plaisir",
	backtoType: "d'accord.",
	setTVProgram: "Ok, je met %s",
	askTVType: "quel type de programme ?",
	askTVTypeNext: "Un autre type de programme ?",
	nbprogs: "J'ai trouvé %d %s",
	nbprogs1: "J'ai trouvé %d programme de %s",
	nbprogs2: "J'ai trouvé %d programme d'%s",
	nbprogs3: "J'ai trouvé %d programme non classé",
	unclassed: "non classé",
	setProgram: "Je met %s",
	notimeSetProgram: "je ne peux pas mettre %s, ce n'est pas aujourd'hui.",
	Sommaire: "Tu peux dire les Documentaire, les Film, les Téléfilm, les Série, l'Information, la Culture, les Divertissement, le Sport, la Jeunesse ou les non classé.",
	noProg: "je n'ai pas trouvé de %s.",
	noresume: "Il n'y a pas de résumé",
	speechTVProgsSommaire: "Tu peux dire répète, programme-l'eux, met-l'eux, rappel-l'eux moi, donne-moi le résumé, à quelle heure, suivant, précédent, reviens aux types, terminé ou annule.",
	nextThing : "Autre chose ?",
	sur: "Sur", 
	a: "à",
	hour: "heure",
	minute: "minute",
	now: "maintenant",
	startedBefore: "commencé depuis %d",
	minpos: "c'est le début de la liste",
	endList: "c'est tout pour les %s.",
	recordProgram: "%s à %d",
	speechProgram: "Il est %d, tu m'as demandé de mettre %s",
	alreadyStarted: "Ce programme est déjà commencé, veux-tu que je le mette ?",
	rememberProgram: "Rappel de %s à %d",
	cron_saved: "%s sauvegardé",
	TVProgramFound: "Stéphane, j'ai trouvé un programme intéréssant. %s sur %c. Veux-tu que je le mette ?|Stèphe, y'a un truc intéressant qui passe. %s sur %c. Ca te branche ?",
	askRecordProgram: "D'accord, je dois intérrompre ton programme 1 minute le temps de le programmer.",
	tvFoundSommaire: "Oui vas-y ou oui s'il te plait. Non enregistre. Non c'est bon ou non merci.",
	recordedProgram: "J'ai enregistré %d programmes",
	noRecordedProgram: "Je n'ai enregistré aucun programme",
	TodayRecordedProgram: "Aujourd'hui à %d, ",
	YesterdayRecordedProgram: "Hier à %d, ",
	BeforeYesterdayRecordedProgram: "Avant-hier à %d, ",
	BeforeRecordedProgram: "Il y a %r jours à %d, ",
	sayRecordedProgram: "%s sur la chaine %i",
	noRemembertoRemove: "Je n'ai trouvé aucun rappel de programme à supprimer.",
	remembertoRemove: "J'ai trouvé %d rappel de programme",
	removedProg: "%s supprimé.",
	askRemoveProgram: "suppression du rappel %s ?",
	askend: "Fin de la liste. Terminé.",
	programs: "Les programmes",
	today: "aujourd'hui"
}	



/*
Errors messages
*/
var error_messages = {
	errorgetProg: "Je n'ai pas pu rechercher les programmes",
	errorRecordProgram: "Le plugin scenariz est manquant, je ne peux pas enregistrer le programme %s",
	errorFreebox: "Le plugin freebox est manquant, je ne peux pas mettre le programme %s",
	errorcron: "Je ne peux pas te rappeler un programme sans titre",
	errornoperiod: "Pour un jour de la semaine, tu dois préciser une plage horaire.",
	tvProgExist: "Le programme %s existe déjà dans les rappels",
	cron_not_saved: "Je n'ai pas pu sauvegarder le programme %s",
	no_token: "Une erreur est survenue dans la requête de recherche du jeton freebox.",
	recorded_cron_not_saved: "Je n'ai pas pu sauvegarder le programme %s",
	recorded_cron_exist: "le %s existe déjà comme programme enregistré",
	no_removedProg: "je n'ai pas réussi à supprimer  le rappel %s"
}



var dayOfWeek = [
'lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'
];


var ttsSearch = [
'. Attend, je regarde','de minuit à deux heure','de deux heure à quatre heure','de quatre heure à six heure','de six heure à huit heure',
'de huit heure à dix heure','de dix heure à midi','de midi à quatorze heure','de quatorze heure à seize heure','de seize heure à dix huit heure',
'de dix huit à vingt heure','de vingt heure à vingt deux heure','de vingt deux heure à minuit','en ce moment','ce soir','en deuxième partie de soirée'
];


exports.ttsSearch = function(pos){ return ttsSearch[pos]}
exports.dayOfWeek = function(day){ return dayOfWeek[day]}
exports.localized = function(msg){ return messages[msg]} 
exports.err_localized = function(msg){ return error_messages[msg]} 
exports.random_localized = function(msg){ var tblanswer = messages[msg].split('|');
										 return tblanswer[Math.floor(Math.random() * tblanswer.length)]}
	