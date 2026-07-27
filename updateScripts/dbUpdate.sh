#!/bin/bash

# Script to automate upadating database items form github repository

echo "Running update script"

rm -rf ~/myscene-git
mkdir ~/myscene-git
git clone https://github.com/BradenLemna/MyScene.git ~/myscene-git

if [ "$1" == "FullUpdate" ]; then
    echo "Running Full Database Update (Removing All Database Files)"
    rm -rf ~/myscene-db/*
elif [ "$1" == "" ]; then
    read -p "Would you like to run a full database update? (Y or N): " input
fi

if [ "$1" == "FullUpdate" ]; then
    echo "Updating sql File"
    cp -r ~/myscene-git/schema.sql ~/myscene-db/schema.sql
elif [ "$input" == "Y" ] || [ "$input" == "y" ]; then
    echo "Running Full Database Update (Removing All Database Files)"
    rm -rf ~/myscene-db/*
    echo "Updating sql File"
    cp -r ~/myscene-git/schema.sql ~/myscene-db/schema.sql
fi

cp ~/myscene-git/updateScripts/dbUpdate.sh ~/dbUpdate.sh
chmod +x ~/dbUpdate.sh