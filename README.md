## Influencer Toolkit Sign Up
Influencer Toolkit Sign Up is a web app that provides users with a fast and easy way to create a newsletter sign up page. It's geared towards Twitter users.

The user visits the website, logs with their Twitter account, and submits their email address. They receive a link to their newsletter sign up page which they can share with anyone, and they will be notified by email any time someone signs up for their newsletter.

Sign up links can include a referral code which will be passed along in the notification email any time someone signs up.

For example, this sign up link "https://itk-signup.herokuapp.com/treylorswift?twRef=balajis" would credit the Twitter user 'balajis' any time someone signs up for 'treylorswift's newsletter.

![admin](https://i.imgur.com/JKYe1aB.png)
![signup](https://i.imgur.com/MTsT8It.png)

### Live Demo
There is a live version deployed to Heroku currently at https://itk-signup.herokuapp.com

### Deploying to Heroku
Out of the box this repo can be deployed to Heroku so long as the following Heroku config variables are defined:
- DATABASE_URL - a url for a Postgresql database
- SESSION_SECRET - a random string used to encrypt session cookies
- CONSUMER_KEY - the Twitter App API keys (obtainable at https://developer.twitter.com/apps)
- CONSUMER_SECRET - part of the above mentioned Twitter API key
- GMAIL_USER - username for the gmail account that will be used to send notification emails
- GMAIL_PW - password for the above account
