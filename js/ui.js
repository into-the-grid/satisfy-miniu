


ui = {};



function genred(txt, genre) {

    return txt.replace(/\{([^/]*)\/([^/]*)\}/g, genre == "woman" ? "$1" : "$2");
}



function playerNameHtml(p) {

    let r = {
        view: p.name,
        examine: p.description
    }
    return `<span class="player-name" data-toggle="popover" title="${r.view}" data-placement="bottom" data-content="${r.examine}">${r.view}</span>`;
}



function thingHtml(t) {

    return `<button type="button" class="btn btn-warning btn-sm" onclick="takeThing(this)">${t}</button>`;
}



function readyThingHtml(t, where) {

    let options = [
        `<a class="dropdown-item" href="#" onclick='useThing("${t}")'>Utiliser</a>`,
        `<a class="dropdown-item" href="#" onclick='dropThing("${t}")'>Laisser ici</a>`,
    ];

    if (where != "satchel" && !my.satchel.length)
        options.push(`<a class="dropdown-item" href="#" onclick='hideThing("${t}")'>Ranger dans le sac</a>`);

    if (where == "satchel") {
        if (!my[my.strongHand])
            options.push(`<a class="dropdown-item" href="#" onclick='showThing("${t}")'>Prendre en main</a>`);
        else if (!my[my.weakHand])
            options.push(`<a class="dropdown-item" href="#" onclick='showThing("${t}")'>Prendre en main</a>`);
    }


    return `
<span class="dropdown">
    <button class="btn btn-warning btn-sm dropdown-toggle" type="button" id="dropdownMenuButton" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
        ${t}
    </button>
    <span class="dropdown-menu" aria-labelledby="dropdownMenuButton">
        ${options.join('')}        
    </span>
</span>    
    `;
}



function exitHtml(e) {

    return `<button type="button" class="btn btn-primary btn-sm" onclick="doExit(this)">${e}</button>`;
}



function playerList(players) {

    return players.map(p => playerNameHtml(p)).join(', ');
}



function playerInventoryHtml(data) {

    let html = '';

    let strong = my.strongHand == "leftHand" ? "gauche" : "droite";
    let weak = my.strongHand == "leftHand" ? "droite" : "gauche";
    my.weakHand = my.strongHand == "leftHand" ? "rightHand" : "leftHand";

    if (my[my.strongHand].length) html +=
        `<p>Dans la main ${strong} vous tenez : ${readyThingHtml(my[my.strongHand], "strong")}</p>`;

    if (my[my.weakHand].length) html +=
        `<p>Dans la main ${weak} vous avez : ${readyThingHtml(my[my.weakHand], "weak")}</p>`;

    if (my.satchel.length) html +=
        `<p>Dans votre besace, il y a : ${readyThingHtml(my.satchel, "satchel")}</p>`;

    return html;
}



function showCarrying(player) {

    let things = (Math.random() > 0.5 ?
        [player.rightHand, player.leftHand] :
        [player.leftHand, player.rightHand]).filter(t => t.length);

    if (things.length)
        $("#players-here")[0].innerHTML +=
            `<p>${player.name} a ${things.map(t => thingHtml(t)).join(" et ")} dans les mains.</p>`;
}







ui["look around"] = function (data) {

    $("#room-description").html(`<p>${genred(data.room.description, my.genre)}</p>`);

    if (my.death) {
        $("#things-here").html('');
        $("#players-here").html('');
        $("#inventory").html('');
        $("#exits").html(my.death);
        return;
    }

    if (data.room.things.length)
        $("#things-here").html(`<p>Il y a ici : ${data.room.things.map(t => thingHtml(t)).join(' ')}</p>`);
    else
        $("#things-here").html('');

    if (data.players.length > 1) $("#players-here")
        .html(`<p>Vous êtes avec : ${playerList(data.players.filter(p => p.name != my.name))}.</p>`);
    else
        $("#players-here").html('');

    for (let player of data.players)
        if (player.name != my.name) showCarrying(player);

    $("#inventory").html(playerInventoryHtml(data));

    $("#exits").html(`<p>Vous pouvez aller vers : ${data.room.exits.map(e => exitHtml(e)).join(' ')}</p>`);

    $('[data-toggle="popover"]').popover({ trigger: 'hover' });
}


ui["new player"] = function (data) {

    appendStory(playerNameHtml(data) + ` vient d'entrer dans le labyrinthe : ${data.labName}.`);
}


ui["bye player"] = function (data) {

    appendStory(playerNameHtml(data.player) + ' vient de quitter le labyrinthe : ' + data.labName + '.');
}



ui["player arrived"] = function (data) {

    appendStory(playerNameHtml(data.player) + " arrive : " + data.player.description);
}



ui["player leaved"] = function (data) {

    appendStory(playerNameHtml(data.player) + " part vers : " + exitHtml(data.path));
}



ui["loot"] = function (data) {

    appendStory("Vous avez pris " + data.thing + '.');
}



ui["player loot"] = function (data) {

    appendStory(playerNameHtml(data) + " a pris " + data.thing + '.');
}



ui["theft"] = function (data) {

    appendStory(
        playerNameHtml(data.thief) + " a pris " + data.thing +
        " des mains de " + playerNameHtml(data.victim) + ' !'
    );
}



ui["theft success"] = function (data) {

    appendStory(
        "Vous avez pris " + data.thing +
        " des mains de " + playerNameHtml(data.victim) + ' !'
    );
}



ui["victim of theft"] = function (data) {

    appendStory(
        playerNameHtml(data.thief) + " vous a pris " + data.thing + ' !'
    );
}



ui["theft attempt"] = function (data) {

    appendStory(
        playerNameHtml(data.thief) + " a essayé de prendre " + data.thing +
        " des mains de " + playerNameHtml(data.victim) + ' !'
    );
}



ui["theft failure"] = function (data) {

    appendStory(
        "Vous n'avez pas réussi à prendre " + data.thing +
        " des mains de " + playerNameHtml(data.victim) + ' !'
    );
}



ui["not victim of theft"] = function (data) {

    appendStory(
        playerNameHtml(data.thief) + " a essayé de vous prendre " + data.thing + ' !'
    );
}



ui["dropped"] = function (data) {

    appendStory(
        "Vous avez laissé " + data.thing + ' ici.'
    );
}



ui["player dropped"] = function (data) {

    appendStory(
        playerNameHtml(data.player) + " a laissé " + data.thing + ' ici.'
    );
}



ui["use succeeded"] = function (data) {

    appendStory(
        "Vous utilisez " + data.thing + '. ' + data.descriptions.join(' ')
    );
}



ui["player use succeeded"] = function (data) {

    appendStory(
        playerNameHtml(data.player) + " a utilisé " + data.thing + '. ' + data.descriptions.join(' ')
    );
}



ui["use failed"] = function (data) {

    appendStory(
        "Vous essayez d'utiliser " + data.thing + ", sans succès."
    );
}



ui["player use failed"] = function (data) {

    appendStory(
        playerNameHtml(data.player) + " a essayé d'utiliser " + data.thing + ", sans succès."
    );
}



ui["hiding thing"] = function (data) {

    appendStory(
        "Vous rangez " + data.thing + " dans votre besace."
    );
}



ui["player hiding thing"] = function (data) {

    appendStory(
        playerNameHtml(data.player) + " range " + data.thing + " dans sa besace."
    );
}



ui["showing thing"] = function (data) {

    appendStory(
        "Vous sortez " + data.thing + " de votre besace."
    );
}



ui["player showing thing"] = function (data) {

    appendStory(
        playerNameHtml(data.player) + " sort " + data.thing + " de sa besace."
    );
}




