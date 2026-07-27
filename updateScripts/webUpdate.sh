#!/bin/bash

# Script to automate upadating webserver items form github repository

echo "Running update script"

rm -rf ~/myscene-git
mkdir ~/myscene-git
git clone https://github.com/BradenLemna/MyScene.git ~/myscene-git

echo "Updating Website"

cp -r ~/myscene-git/. /var/www/html
nginx -s reload

cp ~/myscene-git/updateScripts/webUpdate.sh ~/webUpdate.sh
chmod +x ~/webUpdate.sh