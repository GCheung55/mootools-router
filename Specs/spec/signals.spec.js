describe('crossroads Signals', function(){

    afterEach(function(){
        crossroads.removeAll();
        crossroads.removeEvents();
    });

    it('should dispatch default if don\'t match any route', function(){
        var count = 0, requests = [];
        var a = crossroads.add('/{foo}_{bar}');

        a.addEvent('match', function(foo, bar){
            expect(null).toEqual('fail: shouldn\'t match');
        });
        crossroads.addEvent('default', function(request){
            requests.push(request);
            count++;
        });

        crossroads.parse('/lorem/ipsum');
        crossroads.parse('/foo/bar');

        expect( requests[0] ).toBe( '/lorem/ipsum' );
        expect( requests[1] ).toBe( '/foo/bar' );
        expect( count ).toBe( 2 );
    });


    it('should dispatch routed at each match', function(){
        var count = 0,
            requests = [],
            count2 = 0,
            routed,
            first;

        var a = crossroads.add('/{foo}_{bar}');
        a.addEvent('match', function(foo, bar){
            count++;
        });

        crossroads.addEvent('default', function(request){
            requests.push(request);
            count2++;
        });

        crossroads.addEvent('match', function(request, data){
            requests.push(request);
            count++;

            expect( request ).toBe( '/foo_bar' );
            expect( data.route ).toBe( a );
            expect( data.params[0] ).toEqual( 'foo' );
            expect( data.params[1] ).toEqual( 'bar' );
            routed = true;
            first = data.isFirst;
        });

        crossroads.parse('/lorem/ipsum');
        crossroads.parse('/foo_bar');

        expect( requests[0] ).toBe( '/lorem/ipsum' );
        expect( requests[1] ).toBe( '/foo_bar' );
        expect( count ).toBe( 2 );
        expect( count2 ).toBe( 1 );
        expect( routed ).toEqual( true );
        expect( first ).toEqual( true );

    });


    it('isFirst should be false on greedy matches', function () {

        var count = 0,
            firsts = [];

        crossroads.addEvent('match', function(req, data){
            count += 1;
            firsts.push(data.isFirst);
        });

        //anti-pattern!
        crossroads.add('/{a}/{b}');
        crossroads.add('/{a}/{b}').setGreedy(true);
        crossroads.add('/{a}/{b}').setGreedy(true);

        crossroads.parse('/foo/bar');

        expect( count ).toEqual( 3 );
        expect( firsts[0] ).toEqual( true );
        expect( firsts[1] ).toEqual( false );
        expect( firsts[2] ).toEqual( false );

    });

    it('should dispatch `pass` when matching another route', function () {

        var count = 0,
            vals = [],
            req;

        var r1 = crossroads.add('/{a}', function(a){
            vals.push(a);
            count += 1;
        });

        r1.addEvent('pass', function(r){
            vals.push('lorem'); //make sure happened before next matched
            req = r;
            count += 1;
        });

        var r2 = crossroads.add('/foo/{a}', function(a){
            vals.push(a);
            count += 1;
        });

        crossroads.parse('/foo');
        crossroads.parse('/foo/bar');

        expect( count ).toBe( 3 );
        expect( vals ).toEqual( ['foo', 'lorem',  'bar'] );
        expect( req ).toEqual( '/foo/bar' );

    });

});
