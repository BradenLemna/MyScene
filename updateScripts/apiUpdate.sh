#!/bin/bash

# Script to automate updating API items form github repository

echo "Running update script"

rm -rf ~/myscene-git
mkdir ~/myscene-git
rm -rf ~/myscene-api/apiServer/*
rm -rf ~/myscene-api/apiCalls/*

git clone https://github.com/BradenLemna/MyScene.git ~/myscene-git

cp -r ~/myscene-git/src/backend/serversideapi/apiServer/* ~/myscene-api/apiServer/
cp -r ~/myscene-git/src/backend/serversideapi/apiCalls/* ~/myscene-api/apiCalls/
cp -r ~/myscene-git/src/backend/db-api/* ~/myscene-api/db-api/
cp ~/myscene-git/src/backend/db.php ~/myscene-api/db-api/db.php

cp ~/myscene-git/updateScripts/apiUpdate.sh ~/apiUpdate.sh
chmod +x ~/apiUpdate.sh

pm2 reload ~/myscene-api/apiServer/index.js