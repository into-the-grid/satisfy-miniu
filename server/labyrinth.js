



function duration(quantity, unit) {

    return {
        "sec": quantity * 1000,
        "min": quantity * 1000 * 60,
        "hou": quantity * 1000 * 60 * 60,
        "heu": quantity * 1000 * 60 * 60,
        "day": quantity * 1000 * 60 * 60 * 24,
        "jou": quantity * 1000 * 60 * 60 * 24,
        "wee": quantity * 1000 * 60 * 60 * 24 * 7,
        "sem": quantity * 1000 * 60 * 60 * 24 * 7,
        "mon": quantity * 1000 * 60 * 60 * 24 * 30,
        "moi": quantity * 1000 * 60 * 60 * 24 * 30,
        "yea": quantity * 1000 * 60 * 60 * 24 * 365.25,
        "ann": quantity * 1000 * 60 * 60 * 24 * 365.25,
        "cen": quantity * 1000 * 60 * 60 * 24 * 365.25 * 100,
        "siè": quantity * 1000 * 60 * 60 * 24 * 365.25 * 100,
    }[unit.slice(0, 3)];
}



function Labyrinth(labName, parsed, radio) {

    this.labName = labName;

    this.radio = radio;

    this.players = {};
    this.rooms = {};
    this.wildThings = {};
    this.flags = {};

    for (let room of parsed)
        this.rooms[room.roomName] =
            new Room(this, room.roomName, room.content);

    this.initialRoom = this.rooms[parsed[0].roomName];

    this.respawnTime = 60 * 1000;
}



Labyrinth.prototype.input = function (pid, data) {

    this.players[pid].execute[data.cmd]
        .call(this.players[pid], data);
}



Labyrinth.prototype.send = function (msg) {

    for (let pid in this.players)
        this.players[pid].send(msg);
}



Labyrinth.prototype.setFlag = function (flag, duration) {

    if (this.flags[flag]) clearTimeout(this.flags[flag]);

    let that = this;

    this.flags[flag] = setTimeout(function () {

        that.delFlag(flag);

    }, duration);

    this.refreshEveryRoom();
}



Labyrinth.prototype.delFlag = function (flag) {

    delete this.flags[flag];
    this.refreshEveryRoom();
}



Labyrinth.prototype.refreshEveryRoom = function () {

    for (let r in this.rooms)
        this.rooms[r].refreshRelevantContent();
}



Labyrinth.prototype.newPlayer = function (pid, name, description, strongHand, genre) {

    if (this.players[pid]) throw "Player already in";

    this.send({
        msg: "new player",
        labName: this.labName,
        name,
        description
    });

    this.players[pid] = new Player(this, pid, name, description, strongHand, genre);

    this.players[pid].goto(this.initialRoom.roomName);

    for (let p in this.players[pid].location.playersHere)
        this.players[p].lookAround();
}



Labyrinth.prototype.delPlayer = function (pid) {

    let described = this.players[pid].describe();

    this.send({
        msg: "bye player",
        labName: this.labName,
        player: described
    });

    for (let where in this.players[pid].inventory)
        if (this.players[pid].inventory[where] != '')
            delete this.wildThings[this.players[pid].inventory[where]];

    let location = this.players[pid].location;

    delete this.players[pid].location.playersHere[pid];
    delete this.players[pid];

    location.refreshRelevantContent(true);
}



function Player(lab, pid, name, description, strongHand, genre) {

    this.labyrinth = lab;
    this.pid = pid;
    this.name = name;
    this.description = description;
    this.location = lab.initialRoom;
    this.inventory = {
        leftHand: '',
        rightHand: '',
        satchel: ''
    };
    this.strongHand = strongHand;
    this.weakHand = strongHand == "rightHand" ? "leftHand" : "rightHand";
    this.genre = genre;
}



Player.prototype.lookAround = function () {

    let players = [];
    for (let pid of Object.keys(this.location.playersHere)) {
        let p = this.location.playersHere[pid];
        players.push(p.describe());
    }

    this.send({
        msg: "look around",
        room: this.location.appearance(),
        players
    });
}



Player.prototype.describe = function () {

    return {
        name: this.name,
        description: this.description,
        leftHand: this.inventory.leftHand,
        rightHand: this.inventory.rightHand,
        genre: this.genre
    };
}



Player.prototype.leave = function (exit) {

    let path = this.location.exits()
        .filter(e => e.path == exit)[0];

    if (path && this.labyrinth.rooms[path.destination]) {

        this.location.send({
            msg: "player leaved",
            player: this.describe(),
            path: path.path // ← path
        }, [this.pid]);

        let previousLocation = this.location;

        this.goto(path.destination);

        this.location.send({
            msg: "player arrived",
            player: this.describe(),
        }, [this.pid]);

        previousLocation.refreshRelevantContent(true);
        this.location.refreshRelevantContent(true);

    } else {

        this.send({
            msg: "invalid exit"
        });
    }
}



Player.prototype.goto = function (roomName) {

    delete this.location.playersHere[this.pid];
    this.location = this.labyrinth.rooms[roomName];
    this.location.playersHere[this.pid] = this;
}



Player.prototype.send = function (msg) {

    this.labyrinth.radio.labOutput(this.pid, Object.assign(
        {},
        msg,
        this.inventory
    ));
}



Player.prototype.take = function (thing, slot) {

    let took = false;

    if (!this.labyrinth.wildThings[thing]) { // it's not in the wild

        if (this.location.relevantContent.parts
            .map(p => p.thing).includes(thing)) {

            this.newWildThing(thing, slot);

            this.send({
                msg: "loot",
                thing,
                slot
            });

            this.location.send({
                msg: "player loot",
                name: this.name,
                description: this.description,
                thing,
                slot
            }, [this.pid]);

            took = true;
        }

    } else if (this.location.wildThingsHere[thing]) { // it's wild and here

        this.location.wildThingsHere[thing]
            .moveTo(this, slot);

        this.send({
            msg: "loot",
            thing,
            slot
        });

        this.location.send({
            msg: "player loot",
            name: this.name,
            description: this.description,
            thing,
            slot
        }, [this.pid]);

        took = true;

    } else { // in nearby players?

        for (let pid in this.location.playersHere) {

            let has = this.location.playersHere[pid].has(thing);

            if (has == "strongHand") {

                this.location.send({
                    msg: "theft attempt",
                    thing,
                    thief: {
                        name: this.name,
                        description: this.description
                    },
                    victim: this.location.playersHere[pid].describe()
                }, [this.pid, this.location.playersHere[pid].pid]);

                this.send({
                    msg: "theft failure",
                    thing,
                    victim: this.location.playersHere[pid].describe()
                });

                this.location.playersHere[pid].send({
                    msg: "not victim of theft",
                    thing,
                    thief: this.describe()
                });

                break;

            } else if (has == "weakHand") {

                this.location.send({
                    msg: "theft",
                    thing,
                    thief: { name: this.name, description: this.description },
                    victim: this.location.playersHere[pid].describe()
                }, [this.pid, this.location.playersHere[pid].pid]);

                this.send({
                    msg: "theft success",
                    thing,
                    victim: this.location.playersHere[pid].describe()
                });

                this.location.playersHere[pid].send({
                    msg: "victim of theft",
                    thing,
                    thief: this.describe()
                });

                this.labyrinth.wildThings[thing]
                    .moveTo(this, slot);

                took = true;

                break;
            }
        }
    }

    if (took) this.location.refreshRelevantContent(true);
}



Player.prototype.newWildThing = function (description, slot) {

    this.labyrinth.wildThings[description] =
        new Thing(this.labyrinth, description, this);

    this.inventory[slot] = description;
}



Player.prototype.has = function (thing) {

    if (this.inventory.leftHand == thing)
        return this.strongHand == "leftHand" ? "strongHand" : "weakHand";

    if (this.inventory.rightHand == thing)
        return this.strongHand == "rightHand" ? "strongHand" : "weakHand";

    return "no";
}



Player.prototype.holds = function (thing) {

    let where = false;

    if (this.inventory.leftHand == thing) where = "leftHand";
    else if (this.inventory.rightHand == thing) where = "rightHand";
    else if (this.inventory.satchel == thing) where = "satchel";

    return where;
}



Player.prototype.drop = function (thing) {

    if (!this.holds(thing)) {

        this.send({
            msg: "drop failed",
            thing
        });

    } else {

        this.labyrinth.wildThings[thing].moveTo(this.location);

        this.send({
            msg: "dropped",
            thing
        });

        this.location.send({
            msg: "player dropped",
            player: this.describe(),
            thing
        }, [this.pid]);

        this.location.refreshRelevantContent(true);
    }
}



Player.prototype.use = function (thing) {

    let useParts =
        this.location.relevantContent.parts
            .filter(p => p.type == "use" && p.thing == thing);

    let outcome;

    if (useParts.length) {

        outcome = "use succeeded";

        for (let usePart of useParts)
            for (let effect of usePart.effects)
                this.labyrinth.setFlag(
                    effect.flag,
                    duration(effect.time, effect.unit)
                );

        this.labyrinth.wildThings[thing].respawn();

    } else {

        outcome = "use failed";
    }

    this.location.refreshRelevantContent(true);

    this.send({
        msg: outcome,
        descriptions: useParts.map(up => up.description),
        thing
    });

    this.location.send({
        msg: "player " + outcome,
        player: this.describe(),
        descriptions: useParts.map(up => up.description),
        thing
    }, [this.pid]);
}



Player.prototype.hideThing = function (thing) {

    let where = '';
    if (this.inventory.rightHand == thing) where = "rightHand";
    else if (this.inventory.leftHand == thing) where = "leftHand";

    if (where == '') return;

    this.inventory[where] = this.inventory.satchel;
    this.inventory.satchel = thing;

    this.send({
        msg: "hiding thing",
        thing
    });

    this.location.send({
        msg: "player hiding thing",
        player: this.describe(),
        thing
    }, [this.pid]);

    this.location.refreshRelevantContent(true);
}



Player.prototype.showThing = function (thing) {

    if (this.inventory.satchel != thing) return;

    let where = this.strongHand;
    if (this.inventory[this.strongHand] != '' &&
        this.inventory[this.weakHand] == '')
        where = this.weakHand;

    this.inventory.satchel = this.inventory[where];
    this.inventory[where] = thing;

    this.send({
        msg: "showing thing",
        thing
    });

    this.location.send({
        msg: "player showing thing",
        player: this.describe(),
        thing
    }, [this.pid]);

    this.location.refreshRelevantContent(true);
}



Player.prototype.execute = {};



Player.prototype.execute.leave = function (data) {

    this.leave(data.exit);
}



Player.prototype.execute.take = function (data) {

    this.take(data.thing, data.slot);
}



Player.prototype.execute.drop = function (data) {

    this.drop(data.thing);
}



Player.prototype.execute.use = function (data) {

    this.use(data.thing);
}



Player.prototype.execute.hide = function (data) {

    this.hideThing(data.thing);
}



Player.prototype.execute.show = function (data) {

    this.showThing(data.thing);
}



function Room(lab, roomName, content) {

    this.labyrinth = lab;
    this.roomName = roomName;
    this.content = content;
    this.playersHere = {};
    this.wildThingsHere = {};

    this.refreshRelevantContent();
}



Room.prototype.send = function (msg, except) {

    for (let pid in this.playersHere)
        if (!except.includes(pid))
            this.labyrinth.players[pid].send(msg);
}



Room.prototype.exits = function () {

    return this.relevantContent.parts.filter(part => part.type == "exit");
}



Room.prototype.appearance = function () {

    let things = this.relevantContent.parts.filter(part => part.type == "thereis"); // what's supposed to be here

    things = things.map(t => t.thing);

    things = things.filter(thing => !Object.keys(this.labyrinth.wildThings).includes(thing)); // if it's not wild anywhere

    things = things.concat(Object.keys(this.wildThingsHere)); // and what's wild here

    let exits = this.exits().map(e => e.path);

    return {
        description: this.relevantContent.description,
        exits,
        things,
        victory: this.relevantContent.parts.filter(p => p.type == "victory").length > 0,
        dead: this.relevantContent.parts.filter(p => p.type == "dead").length > 0,
    };
}



Room.prototype.refreshRelevantContent = function (force) {

    let previouslyRelevant = this.relevantContent;

    for (let content of this.content)
        if (this.checkEveryCondition(content.conditions))
            this.relevantContent = content;

    if (force || this.relevantContent != previouslyRelevant)
        for (let pid in this.playersHere)
            this.playersHere[pid].lookAround();
}



Room.prototype.checkCondition = function (condition) {

    if (condition.type == "flag") {

        return !!this.labyrinth.flags[condition.flag];

    } else if (condition.type == "hold") {

        for (let pid in this.playersHere) {
            let holds = this.playersHere[pid].holds(condition.thing);
            if (holds && holds != "satchel") return true;
        }

        return false;

    } else if (condition.type == "after") {

        return false;

    } else throw "bad condition type";
}



Room.prototype.checkEveryCondition = function (list) {

    for (let condition of list)
        if (!this.checkCondition(condition))
            return false;

    return true;
}



function Thing(lab, description, location) {

    this.labyrinth = lab;
    this.initialLocation = location;
    this.currentLocation = location;
    this.description = description;
}



Thing.prototype.respawn = function () {

    this.removeFromCurrentLocation();
    delete this.labyrinth.wildThings[this.description];
    this.labyrinth.refreshEveryRoom();
}



Thing.prototype.moveTo = function (newLocation, slot) {

    this.removeFromCurrentLocation();
    this.insertInto(newLocation, slot);
}



Thing.prototype.removeFromCurrentLocation = function () {

    let location = this.currentLocation;

    if (location instanceof Player) {

        let owner = location;

        if (owner.inventory.leftHand == this.description)
            owner.inventory.leftHand = '';

        else if (owner.inventory.rightHand == this.description)
            owner.inventory.rightHand = '';

        else if (owner.inventory.satchel == this.description)
            owner.inventory.satchel = '';

    } else if (location instanceof Room) {

        delete location.wildThingsHere[this.description];

    } else throw "bad location";
}



Thing.prototype.insertInto = function (location, slot) {

    this.currentLocation = location;

    if (location instanceof Room) {

        location.wildThingsHere[this.description] = this;
        location.refreshRelevantContent();

    } else if (location instanceof Player) {

        location.inventory[slot] = this.description;
    }
}






module.exports = Labyrinth;


/*

let l = new Labyrinth(lab,
    function(pid, data) {
        console.log('<'+pid+'> '+JSON.stringify(data, null, 4))
    }
);

l.newPlayer("1up", "jake", "gossbo", "leftHand");
l.newPlayer("2up", "john", "the mon", "rightHand");



console.log("/////////////////  TAKE 1");

l.input("1up", {
    cmd: "take",
    thing: "un cube",
    slot: "rightHand"
});



console.log("/////////////////  LEAVING");

l.input("1up", {
    cmd: "leave",
    exit: "nord"
});



console.log("/////////////////  USE");

l.input("1up", {
    cmd: "use",
    thing: "un cube",
});



console.log("/////////////////  COME BACK");

l.input("1up", {
    cmd: "leave",
    exit: "sud"
});



console.log("/////////////////  TAKE 2");

l.input("2up", {
    cmd: "take",
    thing: "un cube",
    slot: "rightHand"
});


*/


