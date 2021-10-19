
const express = require('express');
const exphbs = require('express-handlebars');
const cookieParser = require('cookie-parser');

const crypto = require('crypto');
const app = express();
const authTokens = {};

const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 8081;

const fs = require('fs');

const parser = require("./server/parser.js");
const Labyrinth = require("./server/labyrinth.js");



const supa = require('@supabase/supabase-js');

const options = {}
const supabase = supa.createClient()



/*
var users = [
    // This user is added to the array to avoid creating new user on each restart
    {
        firstName: 'John',
        lastName: 'Doe',
        email: 'johndoe@email.com',
        genre: 'other',
        description: 'the Glorious Jackass',
        strongHand: 'rightHand',
        // This is the SHA256 hash for value of `password`
        password: 'XohImNooBHFR0OVvjcYpJ3NgPQ1qq73WKhHvch0VQtg='
    }
];*/
var user = [];


let labAccess = {};

try {
    (async function f() {
        const { data, error } = await supabase
            .from('data')
            .select('content');
        return data;
    })().then(function (data) {
        if (!data) {
            console.log("No access to DB.");
            return;
        }
        if (data[0]) users = data[0].content;
        console.log("User database loaded.");
        if (data[1]) labAccess = data[1].content;
    });
} catch (e) {
    console.log("Error accessing DB.");
}

const getHashedPassword = (password) => {
    const sha256 = crypto.createHash('sha256');
    const hash = sha256.update(password).digest('base64');
    return hash;
}

const generateAuthToken = () => {
    return crypto.randomBytes(30).toString('hex');
}




const newId = function () {
    let id = 0n;
    return function (prefix) {
        return prefix + (id++).toString();
    }
}()



// radio

let radio = {

    players: {},

    enterLabyrinth: function (pid, msg) {

        radio.players[pid].labyrinth = msg.labyrinth;
        labyrinths[msg.labyrinth].lab.newPlayer(
            pid,
            radio.players[pid].name,
            radio.players[pid].description,
            radio.players[pid].strongHand,
            radio.players[pid].genre,
        )
    },

    exitLabyrinth: function (pid) {

        if (labyrinths[radio.players[pid].labyrinth])
            labyrinths[radio.players[pid].labyrinth].lab.delPlayer(pid);

        radio.players[pid].labyrinth = '';
    },

    command: function (pid, msg) {

        labyrinths[radio.players[pid].labyrinth].lab.input(pid, msg);
    },

    labOutput: function (pid, data) {

        radio.players[pid].socket.emit("labyrinth data", data);

        if (data.room && data.room.victory) {
            labSuccess(
                pid,
                radio.players[pid].name,
                radio.players[pid].description,
                radio.players[pid].strongHand,
                radio.players[pid].genre,
                radio.players[pid].labyrinth
            );
        }

        if (data.room && data.room.dead) {
            
            radio.players[pid].socket.emit("dead");
        }
    }
};



// read labyrinths

function readFiles(dirname, onFileContent, onError) {
    fs.readdir(dirname, function (err, filenames) {
        if (err) {
            onError(err);
            return;
        }
        filenames.forEach(function (filename) {
            fs.readFile(dirname + filename, 'utf-8', function (err, content) {
                if (err) {
                    onError(err);
                    return;
                }
                onFileContent(filename, content);
            });
        });
    });
}

const labyrinths = {};

readFiles("labyrinths/", function (filename, content) {

    let name = filename.slice(0, -4);
    labyrinths[name] = { source: content };
    try {
        labyrinths[name].parsed = parser.parse(labyrinths[name].source);

        labyrinths[name].lab = new Labyrinth(name, labyrinths[name].parsed, radio);

    } catch (e) {
        console.warn("error loading "+filename);
        console.warn(e);
    }

}, function (err, filenames) {

    console.warn(err, filenames);
});


/*
let labAccess = {};

fs.readFile("auth/labaccess.json", "utf-8", function (err, content) {

    if (err) {

        console.log("lab access file not found, creating labaccess.json");

        fs.writeFile("auth/labaccess.json", "{}", (err) => {
            if (err)
                console.error(err);
            else {
                console.log("labaccess.json created");
            }
        });
    } else {

        labAccess = JSON.parse(content);
    }
})
*/


function labSuccess(pid, name, description, strongHand, genre, labyrinth) {

    console.log("lab success");

    users.filter(user =>
        name == user.firstName + ' ' + user.lastName &&
        description == user.description &&
        strongHand == user.strongHand &&
        genre == user.genre).map(user => user.email).forEach(email => {

            console.log(email);

            if (!labAccess[email]) labAccess[email] = [];

            if (!labAccess[email].includes(labyrinth))
                labAccess[email].push(labyrinth);

            radio.players[pid].socket.emit("ranking up", {
                labsDone: labAccess[email],
                availableLabs: Object.keys(labyrinths).filter(name => labLevel(name) <= labAccess[email].length)
            });
    });

    

    (async function() {
        const { data, error } = await supabase
        .from("data")
        .upsert({ id: 2, content: labAccess })
    })().then(function(data) {
        console.log("UPSERT", data);
    });
    

    /*
        fs.writeFile("auth/labaccess.json", JSON.stringify(labAccess), (err) => {
            if (err)
                console.error(err);
            else {
                console.log("labaccess.json updated");
            }
        });
        */
}



function getLevel(email) {

    return labAccess[email] ? labAccess[email].length : 0;
}



function labLevel(labName) {

    let match = labName.match(/\([0-9]+\)/);

    return match ? parseInt(match[0].slice(1, -1)) : 1;
}



app.use('/css', express.static(__dirname + '/css'));
app.use('/js', express.static(__dirname + '/js'));
app.use('/assets', express.static(__dirname + '/assets'));



// to support URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

app.use((req, res, next) => {
    const authToken = req.cookies['AuthToken'];
    req.user = authTokens[authToken];
    next();
});

app.engine('hbs', exphbs({
    extname: '.hbs'
}));

app.set('view engine', 'hbs');

app.get('/', (req, res) => {
    res.render('home');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const hashedPassword = getHashedPassword(password);

    const user = users.find(u => {
        return u.email === email && hashedPassword === u.password
    });

    if (user) {
        const authToken = generateAuthToken();

        authTokens[authToken] = email;

        res.cookie('AuthToken', authToken);
        res.redirect('/inside');
        return;
    } else {
        res.render('login', {
            message: 'Invalid username or password',
            messageClass: 'alert-danger'
        });
    }
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', (req, res) => {
    const { email, firstName, lastName, genre, description, strongHand, password, confirmPassword } = req.body;

    if (password === confirmPassword) {
        if (users.find(user => user.email === email)) {

            res.render('register', {
                message: 'User already registered.',
                messageClass: 'alert-danger'
            });

            return;
        }

        const hashedPassword = getHashedPassword(password);

        users.push({
            firstName,
            lastName,
            genre,
            description,
            strongHand,
            email,
            password: hashedPassword
        });



        (async function () {
            const { data, error } = await supabase
                .from("data")
                .upsert({ id: 1, content: users })
        })().then(function (data) {
            console.log("UPSERT", data);
        });


        /*
        fs.writeFile("auth/db.json", JSON.stringify(users), (err) => {
            if (err)
                console.error(err);
            else {
                console.log("New user " + email + " saved!");
            }
        });
        */

        res.render('login', {
            message: 'Registration Complete. Please login to continue.',
            messageClass: 'alert-success'
        });

    } else {
        res.render('register', {
            message: 'Password does not match.',
            messageClass: 'alert-danger'
        });
    }
});



app.get('/inside', (req, res) => {
    if (req.user) {
        let user = users.find(user => user.email === req.user);
        let userLevel = getLevel(user.email);
        let info = {
            firstName: user.firstName,
            lastName: user.lastName,
            description: user.description,
            strongHand: user.strongHand,
            genre: user.genre,
            level: userLevel,
            labyrinths: Object.keys(labyrinths).filter(name => labLevel(name) <= userLevel),
            labsDone: labAccess[user.email] || []
        };
        res.render('inside', { info });
    } else {
        res.render('login', {
            message: 'Please login to continue',
            messageClass: 'alert-danger'
        });
    }
});



let userCount = 0;

io.emit("disconnect");

io.on('connection', function (socket) {

    socket.emit("introduce");

    let pid = newId("P");
    radio.players[pid] = {
        name: "username",
        description: "description",
        strongHand: "rightHand",
        genre: "other",
        socket: socket
    };

    socket.on("introducing", function (data) {

        radio.players[pid].name = data.name;
        radio.players[pid].description = data.description;
        radio.players[pid].strongHand = data.strongHand;
        radio.players[pid].genre = data.genre;

        userCount = io.engine.clientsCount;
        io.emit("user count", userCount);
    });

    socket.on('chat message', function (msg) {

        io.emit('chat message', msg);
    });

    socket.on("enter labyrinth", function (msg) {

        radio.enterLabyrinth(pid, msg);
    });

    socket.on("exit labyrinth", function (msg) {

        radio.exitLabyrinth(pid);
    });

    socket.on("command", function (msg) {

        radio.command(pid, msg);
    });

    socket.on("disconnect", function () {

        userCount = Math.max(0, userCount - 1);
        io.emit("user count", userCount);

        radio.exitLabyrinth(pid);
    });
});



http.listen(port, function () {

    console.log('listening on *:' + port);
});

