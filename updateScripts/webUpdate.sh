#!/bin/bash

# Script to automate upadating webserver items form github repository

echo "Running update script"

rm -rf ~/myscene-git
git clone https://github.com/BradenLemna/MyScene.git ~/myscene-git

if [ "$1" == "FullUpdate" ]; then
    echo "Running Full Database Update (Removing All Database Files)"
    rm -rf ~/myscene-db
elif [ "$1" == "" ]; then
    read -p "Would you like to run a full database update? (Y or N): " input
fi

echo "Updating Website"

cp -r ~/myscene-git/. /var/www/html

if [ "$1" == "FullUpdate" ]; then
    echo "Updating sql File"
    cp -r ~/myscene-git/schema.sql ~/myscene-db
elif [ "$input" == "Y" ] || [ "$input" == "y" ]; then
    echo "Running Full Database Update (Removing All Database Files)"
    rm -rf ~/myscene-db
    echo "Updating sql File"
    cp -r ~/myscene-git/schema.sql ~/myscene-db
fi

cp -r ~/myscene-git/src/backend/db-api/. ~/myscene-db/db-api
cp ~/myscene-git/updateScripts/webUpdate.sh ~/webUpdate.sh