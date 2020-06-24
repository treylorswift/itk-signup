import * as pg from 'pg'
import * as TwitterAuth from './TwitterAuth'
import * as Twitter from 'twitter-lite'
import * as express from 'express';

//when hosting on Heroku, make sure to define the following environment vars ("Config Variables")
//DATABASE_URL - the location of the postgresql database
//SESSION_SECRET - random string used to encrypt session cookies
//CONSUMER_KEY - the Twitter App API key
//CONSUMER_SECRET - the Twitter App API

var session         = require('express-session');
var passport        = require('passport');
var TwitterStrategy = require('passport-twitter').Strategy;
const nodemailer    = require('nodemailer');    
const bodyParser    = require('body-parser');

const g_localDevServer = (process.platform === "win32");

var CALLBACK_URL = 'https://itk-signup.herokuapp.com/auth/twitter/callback';

if (g_localDevServer)
    CALLBACK_URL = 'http://localhost:3000/auth/twitter/callback';


//this is used to encrypt session cookies - in production, should be in an environment variable defined on the server
let SESSION_SECRET = process.env.SESSION_SECRET;
if (g_localDevServer)
    SESSION_SECRET = 'vnyfw87ynfch3/AFV(FW(IFCN@A@O#J$F)FANJC@IEQEN'

// Initialize Express and middlewares
var sessionParser = session({secret: SESSION_SECRET, resave: false, saveUninitialized: false});
var app = express();
app.use(sessionParser);
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.urlencoded({ extended: true , limit: '5mb'}));
app.use(bodyParser.json({limit: '5mb'}));


passport.serializeUser(function(user, cb) {
  cb(null, user);
});

passport.deserializeUser(function(obj, cb) {
  cb(null, obj);
});

let g_appAuth:TwitterAuth.AppAuth = null;
let g_pgdb:PGDB = null;


type UserRow = {id_str:string, screen_name:string, email:string};

class PGDB
{
    pool:pg.Pool;
    async Init():Promise<boolean>
    {    
        try
        {
            let dbUrl = process.env.DATABASE_URL;

            console.log("DATABASE_URL:");
            console.log(dbUrl);

            let dbConfig:any = {
                connectionString: dbUrl
            };

            if (g_localDevServer)
            {
                dbConfig.user = 'postgres';
                dbConfig.password = 'testing123';
            }
            else
            {
                dbConfig.ssl = {
                    rejectUnauthorized: false
                }
            }

            this.pool = new pg.Pool(dbConfig);

            const res = await this.pool.query(
                `CREATE TABLE IF NOT EXISTS ITKUsers
                (
                    id_str TEXT NOT NULL PRIMARY KEY,
                    screen_name TEXT,
                    email TEXT
                )`);
            //console.log(JSON.stringify(res));
        }
        catch (err)
        {
            console.log("Error initializing PGDB:");
            console.error(err);
            return false;
        }

        return true;
    }

    async GetUserByScreenName(screen_name:string):Promise<UserRow>
    {
        try
        {
            const res = await this.pool.query(
                `SELECT * FROM ITKUsers WHERE screen_name=$1`,
                [screen_name]);

            return res.rows[0] as UserRow;
        }
        catch (err)
        {
            console.log("GetUserByScreenName error:");
            console.error(err);
        }
        return null;
    }

    async GetUserById(id_str:string):Promise<UserRow>
    {
        try
        {
            const res = await this.pool.query(
                `SELECT * FROM ITKUsers WHERE id_str=$1`,
                [id_str]);
       
            return res.rows[0] as UserRow;
        }
        catch (err)
        {
            console.log("GetUserById error:");
            console.error(err);
        }
        return null;
    }


    async SetUser(id_str:string, screen_name:string, email:string):Promise<boolean>
    {
        try
        {
            const res = await this.pool.query(
                `INSERT INTO ITKUsers (id_str, screen_name, email) VALUES ($1,$2,$3)
                 ON CONFLICT (id_str) DO UPDATE SET screen_name=$2,email=$3`,
                [id_str,screen_name,email]);

            return true;
        }
        catch (err)
        {
            console.log("SetUser error:");
            console.error(err);

            return false;
        }
    }

    async SetUserScreenName(id_str:string, screen_name:string):Promise<void>
    {
        try
        {
            const res = await this.pool.query(
                `INSERT INTO ITKUsers (id_str, screen_name) VALUES ($1,$2)
                 ON CONFLICT (id_str) DO UPDATE SET screen_name=$2`,
                [id_str,screen_name]);
            //console.log(JSON.stringify(res));
        }
        catch (err)
        {
            console.log("SetUserScreenName error:");
            console.error(err);
        }
    }

    async RemoveUserById(id_str:string)
    {
        try
        {
            const res = await this.pool.query(
                `DELETE FROM ITKUsers WHERE id_str=$1`,
                [id_str]);
            //console.log(JSON.stringify(res));
        }
        catch (err)
        {
            console.log("RemoveUserById error:");
            console.error(err);
        }
    }

}



app.get('/auth/twitter', async (req,res)=>
{

    //use twitter oauth to obtain user access token and secret
    passport.use(new TwitterStrategy(
        {
            consumerKey: g_appAuth.consumer_key,
            consumerSecret: g_appAuth.consumer_secret,
            callbackURL: CALLBACK_URL
        },
        async function(token, tokenSecret, profile, cb)
        {
            try
            {
                cb(null,profile);
            }
            catch (err)
            {
                console.log("Error attempting to validate user auth keys:");
                console.error(err);

                cb(err,null);
            }

        }
    ));

    let funcToCall = passport.authenticate('twitter');
    funcToCall(req,res);
});

// Set route for OAuth redirect
app.get('/auth/twitter/callback', passport.authenticate('twitter', { successRedirect: '/admin', failureRedirect: '/authError' }));

//after oauth login we do a final check here just so we can show them an error on this landing page if
//something went wrong
app.get('/authError', (req,res) =>
{
    res.send('<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><br/><br/>Error logging you in with Twitter, sorry</body></html>');
});

app.get('/', (req,res)=>
{
    res.send(`
        <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        ${SiteBody(
        `<center>
        <br/><br/>
        Want people to sign up for your newsletter?<br/><br/><br/>We can help. Let's get started!<br/><br/><br/>
        <button onclick="window.location='/auth/twitter'">Sign in with Twitter</button>
        </center>`)}
        </html>`);
});

function GetProfileFromRequest(req)
{
    try
    {
        return req.session.passport.user;
    }
    catch (err)
    {
        return null;
    }
}

function ValidateEmailAddress(email) 
{
    const re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (re.test(email))
        return true;

    return false;
}

app.post('/api/setEmail',(req,res)=>
{
    let profile = GetProfileFromRequest(req);
    if (!profile)
    {
        res.sendStatus(404);
        return;
    }

    var json = req.body;
    if (!json || !json.email || !ValidateEmailAddress(json.email))
    {
        res.sendStatus(404);
        return;
    }
    if (g_pgdb.SetUser(profile.id, profile.username, json.email))
        res.send(JSON.stringify({success:true}));
    else
        res.send(JSON.stringify({success:false}));
});


app.post('/api/cancel',(req,res)=>
{
    let profile = GetProfileFromRequest(req);
    if (!profile)
    {
        res.sendStatus(200);
        return;
    }

    if (g_pgdb.RemoveUserById(profile.id))
        res.send(JSON.stringify({success:true}));
    else
        res.send(JSON.stringify({success:false}));
});

function SiteBody(body):string
{
    let str = 
       `<body style='font-family: "Open Sans", "Helvetica Neue", Helvetica, Arial, sans-serif; font-size:15px;'>
            <div style="display:flex; justify-content:center">
                <div style="display:inline; width:320px;"><img style="width:100%;height:auto" src="logo.png"></div>
            </div>
            <div style="display:flex; justify-content:center">
                <div>${body}</div>
            </div>
        </body>`;

   return str;
}

app.get('/admin', async (req,res)=>
{
    let profile = GetProfileFromRequest(req);
    if (!profile)
    {
        res.redirect('/');
        return;
    }

    var id_str = profile.id;

    //make sure the db always has the most up to date screen name for this user
    await g_pgdb.SetUserScreenName(profile.id, profile.username);
    
    //grab the rest of their info (ie, their email address) from the table..
    let userRow = await g_pgdb.GetUserById(id_str);
    if (!userRow)
    {
        //fatal error if the db isn't working
        res.send('<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><br/><br/>Error accessing your account info, sorry.</body></html>');
        return;
    }

    //some server-side logic here.. if they already have set an email address on their account,
    //include a 'value=' attribute in the <input > we declare below so that the field's value is
    //pre-set to their existing email address
    let valueEqualsEmail = ''

    if (userRow.email)
    {
        //if they have already stored an email, pre fill the input field with it
        valueEqualsEmail = `value=\"${userRow.email}\"`;
    }

    //the link they will direct potential subscribers to once they set their email address..
    var linkPath = `/${userRow.screen_name}`
    var fullLink = `https://itk-signup.herokuapp.com/${userRow.screen_name}`
    
    res.send(`
        <html>
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script>
        function ValidateEmailAddress(email) 
        {
            const re = /^(([^<>()[\\]\\\\.,;:\\s@\\"]+(\\.[^<>()[\\]\\\\.,;:\\s@\\"]+)*)|(\\".+\\"))@((\\[[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\])|(([a-zA-Z\\-0-9]+\\.)+[a-zA-Z]{2,}))$/;
            if (re.test(email))
                return true;
            alert('Please enter a valid email address.');
            return false;
        }
        async function setEmail()
        {
           let email = document.getElementById('email').value;
           if (!ValidateEmailAddress(email))
               return;

           var fetchParams = {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body:JSON.stringify({
                    email:email
                })
            };

            let setResult = (str)=>
            {
                document.getElementById('emailResult').innerHTML = str;
            }

            try
            {
                var resp = await fetch("/api/setEmail", fetchParams);
                var json = await resp.json();

                if (json.success===true)
                    setResult('Thanks! Direct potential subscribers to this sign up page:<br /><br /><a href="${linkPath}">${fullLink}</a><br/><br/>When someone signs up, you will receive an email at the address you provided above. Good luck!<br /><br/><br/>');
                else
                    setResult('Sorry, something went wrong. Please try again later.<br/><br/><br/>');
            }
            catch (err)
            {
                console.error(err);
                setResult('Sorry, something went wrong. Please try again later.');
                return;
            }

        }
        async function cancel()
        {
           var fetchParams = {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body:JSON.stringify({})
            };

            let setResult = (str)=>
            {
                document.getElementById('cancelResult').innerHTML = str;
            }

            try
            {
                var resp = await fetch("/api/cancel", fetchParams);
                var json = await resp.json();

                if (json.success===true)
                    setResult('Sorry to see you go. You can reactivate at any time by submitting your email address above.');
                else
                    setResult('Sorry, something went wrong. Please try again later.');
            }
            catch (err)
            {
                console.error(err);
                setResult('Sorry, something went wrong. Please try again later.');
                return;
            }

        }
        </script>
        </head>
        ${SiteBody(
        `
            <br/>
            Welcome, ${userRow.screen_name}!<br/><br/><br />
            Let's create a form that people can use to opt-in to your newsletter.<br/><br/><br />
            Please share your email address with us so we can notify you when people sign up:<br /><br />
            <input id="email" style="width:220px" type="text" placeholder="Enter your email address" ${valueEqualsEmail}><button onclick="setEmail()"}>Save</button><br/><br /><br/>
            <div id="emailResult">
            </div>
            If you no longer want to maintain a sign up page or be contacted by others, <button onclick="cancel()">Click Here</button> to remove your account.<br/><br/>
            <div id="cancelResult">
            </div>`)}
        </head></html>`);
});



app.post('/api/signUp', async (req,res)=>
{
    //json must contain:
    //id: the twitter id of the user whose newsletter they are interested in
    //email: the email address of the person who is interested
    var json = req.body;
    if (!json || !json.id || !json.email)
    {
        res.sendStatus(404);
        return;
    }
    
    let userRow = await g_pgdb.GetUserById(json.id);

    //we gotta know whose newsletter it is they're looking for..
    //and that person must have given us an email address..
    if (!userRow || !userRow.email)
    {
        res.sendStatus(404);
        return;
    }

    //so now, we can send them that email
    try
    {
        var transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'itksignup',
                pass: 'imsuchaninfluencermichaeljackson22'
            }
        });
 
        var mailOptions = {
          from: 'itksignup@gmail.com',
          to: userRow.email,
          subject: `${json.email} is interested in your newsletter!`,
          text:
`${json.email} has opted in to hear more about your newsletter. Get in touch with them and share your brilliant ideas!

Cheers,

Influencer Toolkit`
        };

        transporter.sendMail(mailOptions, (err, info) =>
        {
            if (err)
            {
                console.log(`Error sending email to ${userRow.email}:`);
                console.log(err);
                res.send(JSON.stringify({success:false}));        
            }
            else
            {
                res.send(JSON.stringify({success:true}));
            }
        });
    }
    catch (err)
    {
        console.log(`Error sending email to ${userRow.email}:`);
        console.log(err);
        res.send(JSON.stringify({success:false}));        
    }
});

app.use(express.static('./www'));

app.get('/*', async (req:express.Request,res)=>
{
    let screen_name_query = req.path.substr(1);
    let user = await g_pgdb.GetUserByScreenName(screen_name_query);

    //if the user hasnt created an account or has not given their email address to use for signup notifications,
    //this page doesn't exist..
    if (!user || !user.email || !user.screen_name || !user.id_str)
    {
        res.send(
           `<html>
            <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
            <body>
            This user has not created a signup, sorry.
            </body>
            </html>`);
        return;
    }
    res.send(
       `<html>
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script>
        function ValidateEmailAddress(email) 
        {
            const re = /^(([^<>()[\\]\\\\.,;:\\s@\\"]+(\\.[^<>()[\\]\\\\.,;:\\s@\\"]+)*)|(\\".+\\"))@((\\[[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\])|(([a-zA-Z\\-0-9]+\\.)+[a-zA-Z]{2,}))$/;
            if (re.test(email))
                return true;
            alert('Please enter a valid email address.');
            return false;
        }
        async function signUp()
        {
            let email = document.getElementById('email').value;
            if (!ValidateEmailAddress(email))
                return;

            let button = document.getElementById("signup");
            button.disabled = 'true';

            var fetchParams = {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body:JSON.stringify({
                    email:email,
                    id:${user.id_str}
                })
            };

            let setResult = (str)=>
            {
                document.getElementById('emailResult').innerHTML = str;
            }

            try
            {
                var resp = await fetch("/api/signUp", fetchParams);
                var json = await resp.json();

                if (json.success===true)
                    setResult('Thanks, you should be hearing from ${user.screen_name} soon!<br /><br />');
                else
                    setResult('Sorry, something went wrong. Please try again later.');
            }
            catch (err)
            {
                console.error(err);
                setResult('Sorry, something went wrong. Please try again later.');
                return;
            }

        }
        </script>
        </head>
        <body style='font-family: "Open Sans", "Helvetica Neue", Helvetica, Arial, sans-serif; font-size:15px;'>
            <div style="display:flex; justify-content:center">
                <div>
                    <br/><br/>
                    <center>
                    Would you like to receive ${user.screen_name}'s newsletter?<br/><br/>
                    <input id="email" style="width:220px;" type="text" placeholder="Enter your email address"><button id="signup" onclick="signUp()">Sign Up</button><br/><br/>
                    <div id="emailResult"></div>
                    </center>
                    <br/>
                    <div style="text-align:right"><a href="/"><img style="width:140px" src="logo.png"></a></div>
                </div>
            </div>
        </body>
        </html>`);
    
   // req.path
});


async function ValidateAppAuth():Promise<boolean>
{
    let app_auth:TwitterAuth.AppAuth;

    if (g_localDevServer)
    {
        let app_auth = TwitterAuth.TryLoadAppAuth('app_auth.json')
        if (!app_auth)
        {
            console.log("Failed to obtain keys from app_auth.json");
            return false;
        }
    }
    else
    {
        //production deploy pulls auth from environment variables
        app_auth.consumer_key = process.env.CONSUMER_KEY;
        app_auth.consumer_secret = process.env.CONSUMER_SECRET;
    }

    try
    {
        console.log("using consumer key: " + app_auth.consumer_key);
        console.log("using consumer secret: " + app_auth.consumer_secret);

        //@ts-ignore
        let testClient = new Twitter({
            consumer_key: app_auth.consumer_key,
            consumer_secret: app_auth.consumer_secret
        });

        const bearerOK = await testClient.getBearerToken();

        //no error means the keys were valid, store them to the global
        //and proceed to check user auth keys
        g_appAuth = app_auth;
    }
    catch (err)
    {
        console.log("Error validating stored app auth keys:");
        console.error(err);
        return false;
    }

    return true;
}

async function main()
{
    //before we start, check to see if we have valid app auth and user auth keys already.
    //if so, we won't need to ask the user for them
    console.log("Getting Twitter API keys..");
    let authOK = await ValidateAppAuth();
    if (!authOK)
    {
        process.exit(-1);
    }

    //make sure db connection works
    console.log("Testing db connection..");
    g_pgdb = new PGDB();
    let dbOK = await g_pgdb.Init();
    if (!dbOK)
    {
        console.log("g_pgdb.Init() failed");
        process.exit(-1);
    }   
    const PORT = process.env.PORT || 3000;
    app.listen(PORT);
    console.log(`Listening on port ${PORT}`);
}

main();



