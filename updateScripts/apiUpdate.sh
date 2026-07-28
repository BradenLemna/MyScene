#!/bin/bash

# Script to automate updating API items form github repository

echo "Running update script"

rm -rf ~/myscene-git
mkdir ~/myscene-git
rm -rf /var/www/myscene-api/apiServer/*
rm -rf /var/www/myscene-api/apiCalls/*
rm -rf /var/www/myscene-api/*.php

git clone https://github.com/BradenLemna/MyScene.git ~/myscene-git

cp -r ~/myscene-git/src/backend/serversideapi/apiServer/* /var/www/myscene-api/apiServer/
cp -r ~/myscene-git/src/backend/serversideapi/apiCalls/* /var/www/myscene-api/apiCalls/
cp -r ~/myscene-git/src/backend/db-api/* /var/www/myscene-api/db-api/
cp ~/myscene-git/src/backend/db.php /var/www/myscene-api/db-api/db.php

chmod +x /var/www/myscene-api/*.php

cp ~/myscene-git/updateScripts/apiUpdate.sh ~/apiUpdate.sh
chmod +x ~/apiUpdate.sh

pm2 reload /var/www/myscene-api/apiServer/index.js