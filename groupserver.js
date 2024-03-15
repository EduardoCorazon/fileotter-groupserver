/*
This is the backend server the FileOtter groupserver
Some things to note:
- I've commented out any console.logs (good to keep for troubleshooting/debug)
- I've commented the relevant functions
 */


const port = 3200;

// imports
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const cors = require('cors');
const fs = require('fs');
const {checkAuthentication} = require('./components/Authentication/Authentication');
const {checkSession} = require('./components/Authentication/Authentication');
const AuthRoutes = require('./components/Authentication/AuthRoutes.js');

// Backend config (for cookie, cors, etc)
const app = express();
const corsOptions = {
    origin: 'http://localhost:3000', // frontend origin
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
};
app.use(cors(corsOptions));
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({
    secret: 'your-secret-key',
    resave: true,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Enable secure cookie in production
        sameSite: 'strict',
    },
}));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://your-frontend-domain.com');
    res.header('Access-Control-Allow-Credentials', true);
    next();
});

// ----------------------------------------------------------------------------
// actual logic starts here

// Load UserList and GroupList
let userList = JSON.parse(fs.readFileSync('UserList.json'));
//console.log(userList)
let groupList = JSON.parse(fs.readFileSync('GroupList.json'));
//console.log(groupList)

app.get('/sessionInfo', checkSession, (req, res) => {
    const userId = req.session.user.id;
    //console.log(userId)

    // Find the user by ID
    const user = userList.find(user => user.id === userId);
    //console.log(user)
    if (!user) {
        return res.status(404).json({error: 'User not found'});
    }

    // Find the groups the user belongs to
    const userGroup = user.group;

    // Find the groups the user owns
    const ownedGroups = Object.values(groupList).filter(group => group.owner.id === userId);

    res.json({username: user.username, withinGroup: userGroup, ownedGroups});
});


//**********************************************************************************
// FUNCTION 3

// Get the group of a user by username
app.get('/getUserGroup/:username', (req, res) => {
    const {username} = req.params;

    //get the ID from username
    //console.log("Username:", username);
    const userId = Object.keys(userList).find(id => userList[id].username === username);
    //console.log("UserID:", userId);

    if (!userId) {
        return res.status(404).json({error: 'User not found'});
    }
    //check if the user belongs to any group
    if (!userList[userId].group) {
        return res.status(404).json({error: 'User is not assigned to any group'});
    }
    const group = userList[userId].group;
    res.json({username, group});
});

//**********************************************************************************
// FUNCTION 4

// create a user
app.post('/createUser', checkSession, (req, res) => {
    const {username, group} = req.body;
    // get ID from auth session
    const userId = req.session.user.id;
    const user = userList.find(user => user.id === userId);
    //console.log('User (username):')
    //console.log(user)
    //console.log('User group:')
    //console.log(user.group)

    if (!user) {
        return res.status(401).json({error: 'Unauthorized', message: 'User sending this request is not found'});
    }

    // check if the user is authorized (belongs to the Administrator Group)
    if (user.group !== 'administrator') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Only users in the Administrator Group can create users'
        });
    }

    //*** REPLACE WITH UUID *****
    // https://www.npmjs.com/package/uuid
    // keeping it simple for now
    const NewuserId = userList.length + 1;

    const defaultPassword = 'password'; // prob change this too to be dynamic

    //user object
    const newUser = {
        id: NewuserId,
        username,
        password: defaultPassword,
        group
    };

    userList.push(newUser);

    // Update UserList.json file
    //fs.writeFileSync('./components/UserManagement/UserList/UserList.json', JSON.stringify(userList));
    fs.writeFileSync('./UserList.json', JSON.stringify(userList, null, 2)); // fixes format

    // don't send passwords to frontend lol
    const userResponse = {...newUser};
    delete userResponse.password;

    res.json({success: true, message: 'User created successfully', user: userResponse});
});

//**********************************************************************************
// Function 5

// create a new group
app.post('/createGroup', checkSession, (req, res) => {
    const {groupName} = req.body;
    const userId = req.session.user.id; // ID of the user who sent this createGroup request

    const newGroup = {
        name: groupName,
        owner: {
            id: userId,
            username: req.session.user.username
        },
        members: [] // perhaps we can include the own user who created the group? or allow for customizability?
    };

    groupList[groupName] = newGroup;
    fs.writeFileSync('GroupList.json', JSON.stringify(groupList, null, 2));
    res.json({success: true, message: 'Group created successfully'});
});


//**********************************************************************************
// Function 6

// Add a user to a group
app.post('/addGroupMember', checkSession, (req, res) => {
    const {groupName, userToAdd} = req.body;
    const userId = req.session.user.id; // ID of user that sent this request
    // find id based on username
    const user = userList.find(user => user.username === userToAdd);

    // check if group exists
    if (!groupList[groupName]) {
        return res.status(404).json({error: 'Not Found', message: 'Group not found'});
    }
    // Check if user exists
    if (!user) {
        return res.status(404).json({error: 'Not Found', message: 'User not found'});
    }
    // Check if the user is the owner of the group
    if (groupList[groupName].owner.id !== userId) {
        return res.status(403).json({error: 'Forbidden', message: 'Only the group owner can add members to the group'});
    }


    groupList[groupName].members.push(userToAdd);
    fs.writeFileSync('GroupList.json', JSON.stringify(groupList, null, 2));
    res.json({success: true, message: 'User added to the group successfully'});
});


//**********************************************************************************
// Function 7

// Get all members of a group
app.get('/groupMembers/:groupName', checkSession, (req, res) => {
    const groupName = req.params.groupName;
    const userId = req.session.user.id; // same as above

    // Check if the group exists
    if (!groupList[groupName]) {
        return res.status(404).json({error: 'Not Found', message: 'Group not found (Does not exist)'});
    }
    const group = groupList[groupName];
    // Check if the user is the owner of the group
    if (!group.owner || group.owner.id !== userId) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Only the group owner can view the members of the group'
        });
    }
    //console.log(group.members);
    // Return the list of members of the group
    res.json({members: group.members});
});


// ----------------------------------------------------------------------------
// You would add routes here for modularity
// For Authentication
app.use('/', AuthRoutes);

//start
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
