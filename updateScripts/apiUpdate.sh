#!/bin/bash

# Script to automate updating API items form github repository

echo "Running update script"

rm -rf ~/myscene-git
rm -rf ~/myscene-api/apiServer/*
rm -rf ~/myscene-api/apiCalls/*

git clone https://github.com/BradenLemna/MyScene.git ~/myscene-git

cp -r ~/myscene-git/src/backend/serversideapi/apiServer/* ~/myscene-api/apiServer/
cp -r ~/myscene-git/src/backend/serversideapi/apiCalls/* ~/myscene-api/apiCalls/
cp ~/myscene-git/updateScripts/apiUpdate.sh ~/apiUpdate.sh

pm2 reload index