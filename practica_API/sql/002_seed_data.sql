INSERT INTO songs (title, listened, status)
SELECT 'Numb - Linkin Park', FALSE, 'pending'
WHERE NOT EXISTS (
    SELECT 1
    FROM songs
    WHERE title = 'Numb - Linkin Park'
);

INSERT INTO songs (title, listened, status)
SELECT 'Bring Me To Life - Evanescence', FALSE, 'pending'
WHERE NOT EXISTS (
    SELECT 1
    FROM songs
    WHERE title = 'Bring Me To Life - Evanescence'
);
