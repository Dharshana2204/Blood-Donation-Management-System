// server.js
require('dotenv').config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { createClient } = require("@supabase/supabase-js");
const app = express();

// Supabase Client Setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Middleware Setup
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: "secret-key", resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Passport Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      const email = profile.emails[0].value;

      // Check if User Already Exists
      const { data, error } = await supabase
        .from('Users')
        .select('*')
        .eq('email', email);

      if (data && data.length > 0) {
        return done(null, data[0]);
      } else {
        // If New User, Insert and Redirect to Role Selection
        const { error } = await supabase
          .from('Users')
          .insert({ email: email });
        
        if (error) console.error("Error inserting user:", error);
        
        return done(null, { email });
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.email);
});

passport.deserializeUser(async (email, done) => {
  const { data, error } = await supabase
    .from('Users')
    .select('*')
    .eq('email', email);
  
  done(null, data[0]);
});

// OAuth Routes
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect("/select-role");
  }
);

// Select Role Page Route
app.get('/select-role', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');
  res.sendFile(__dirname + '/public/select-role.html');
});

// Register Role Endpoint
app.post('/register-role', async (req, res) => {
  const { role } = req.body;
  const email = req.user.email;

  await supabase
    .from('Users')
    .update({ role: role })
    .eq('email', email);

  res.redirect(role === 'donor' ? '/register-donor' : '/hospital-dashboard');
});

// Donor Registration Page Route
app.get('/register-donor', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');
  res.sendFile(__dirname + '/public/register-donor.html');
});

// Register Donor Endpoint
app.post('/register-donor', async (req, res) => {
  const { name, blood_type, location, contact, last_donation } = req.body;
  const email = req.user.email;

  const { data, error } = await supabase
    .from('Users')
    .select('id')
    .eq('email', email);

  const user_id = data[0].id;

  await supabase
    .from('Donors')
    .insert({
      user_id,
      name,
      blood_type,
      location,
      contact,
      last_donation
    });

  res.redirect('/donor-dashboard');
});

// Dashboard Routes
app.get("/dashboard", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");
  res.send(`Welcome ${req.user.email} <br> <a href='/logout'>Logout</a>`);
});

app.get("/donor-dashboard", (req, res) => {
  res.send("Donor Dashboard");
});

app.get("/hospital-dashboard", (req, res) => {
  res.send("Hospital Dashboard");
});

// Logout Route
app.get("/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/");
  });
});

// Server Setup
app.listen(3000, () => console.log("Server running on http://localhost:3000"));
