const jwt = require('jsonwebtoken');
const fs = require('fs');

// get UserList.json
const userListRaw = fs.readFileSync('./UserList.json');
const userList = JSON.parse(userListRaw);

// you always need to map
const users = userList.map(user => ({
    id: user.id,
    username: user.username,
    password: user.password
}));


// Verify session
const checkSession = (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).send({success: false, message: 'Unauthorized'});
    }

    try {
        // Verify the token using the secret key
        const decoded = jwt.verify(token, 'your-secret-key'); // THIS IS WHAT ACTUALLY CREATES THE COOKIE
        // connect.sid is session cookie but token is the actual username + your-secret-key

        req.session.user = decoded.user;
        next();
    } catch (error) {
        return res.status(401).send({success: false, message: 'Unauthorized'});
    }
};

module.exports = {users, checkSession};
