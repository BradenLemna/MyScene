# MyScene
This repository is a continuation of the 2026 HogHacks Project "MyScene". This repository will have more functionality and improved implementation on already implemented features.

# Old README
```
# Hoghacks-2026
This respoitory is for the team **Theta Protocol** at the University of Arkansas' Hoghacks 2026. Look around to see what we're working on!

**Members:**  
Shirley Lin  
Shayne Thompson  
Braden Lemna  
Kamila Cudzich  
Elisabeth Johnson  
Cooper Claussen

## Project Descripton
MyScene is a website that helps you connect with niche and underground artists and allows those artists to self-promote their events, developing the local music scene and strengthening its community. It makes it easy to find upcoming concerts around your area and discover artists that fit your tastes by recommending music based on previous local shows you've attended and your listening habits. You'll be able to input the name of well-known artists and be able to find local artists under the same genre.

MyScene gives these smaller artists an opportunity to connect with the scene by allowing them to add themselves to our database of artists and upload show dates. We differentiate ourselves from other similar platforms by recommending new artists based on previous listening habits and events attended rather than the popularity or status of said artist.

## Run
Our project interfaces with a local MySQL database, so you'll need to set one up before running the program. The database schema can be found in `schema.sql`. Use the .env.example to create your own .env file with the MySQL credentials.


git clone https://github.com/katsu1863/Hoghacks-2026.git
cd HogHacks-2026
- Run `./install.sh` to install necessary packages
- Start a local PHP web server by running `php -S localhost:8000` from the home directory of HogHacks-2026
- Navigate to `http://localhost:8000/src/frontend/main.html` on a Web browser 
 
*The website relies on multiple API Calls that require API keys*
```
